import os
import sys
import json
import asyncio
import concurrent.futures
import requests as req
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from routers import stats, admin
from database import execute, query
from refresh import do_refresh_today, do_refresh_smart, do_refresh_missing_durations

# Rend les modules du collector accessibles (même repo, Railway déploie depuis la racine)
# os.path.abspath(__file__) garantit un chemin absolu même si uvicorn passe un chemin relatif
_COLLECTOR_PATH = os.path.abspath(
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "collector")
)
if os.path.isdir(_COLLECTOR_PATH):
    if _COLLECTOR_PATH not in sys.path:
        sys.path.insert(0, _COLLECTOR_PATH)
    print(f"[config] collector path OK : {_COLLECTOR_PATH}", flush=True)
else:
    print(f"[config] ATTENTION collector path introuvable : {_COLLECTOR_PATH}", flush=True)

YT_KEY        = os.environ.get("YOUTUBE_API_KEY", "")
YT_BASE       = "https://www.googleapis.com/youtube/v3"
RESEND_KEY    = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL    = os.environ.get("REPORT_FROM_EMAIL", "MediaPulse <onboarding@resend.dev>")
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "https://mediapulse.vercel.app")

# Vérifie les variables critiques au démarrage
_db_url = os.environ.get("DATABASE_URL", "")
print(f"[config] DATABASE_URL {'définie' if _db_url else 'MANQUANTE !'}", flush=True)
print(f"[config] YOUTUBE_API_KEY {'définie' if YT_KEY else 'absente'}", flush=True)

# Plage horaire (UTC) — 5h–14h lun–ven
_REFRESH_START_H    = 5
_REFRESH_END_H      = 14
_REFRESH_TODAY_S    = 15 * 60   # toutes les 15 min
_REFRESH_SMART_S    = 30 * 60   # toutes les 30 min
_REPORT_HOUR_UTC    = 16        # rapport email à 16h00 UTC

# Détection (migré depuis GitHub Actions → Railway pour fiabilité)
_DETECT_START_H     = 5         # 5h UTC — même fenêtre que detect.yml
_DETECT_END_H       = 13        # 13h UTC
_DETECT_LIVE_START_H = 6        # 6h UTC — même fenêtre que detect-live.yml
_DETECT_LIVE_END_H  = 10        # 10h UTC
_DETECT_S           = 30 * 60   # toutes les 30 min


def _seed_holidays():
    """
    Insère les jours fériés sénégalais dans excluded_days si absents (idempotent).
    Couvre l'année précédente, l'année courante et la suivante.
    Les week-ends sont ignorés (déjà auto-exclus côté détecteur).
    """
    from datetime import date as _date

    FIXED_HOLIDAYS = {
        (1,  1): "Jour de l'An",
        (4,  4): "Fête de l'Indépendance",
        (5,  1): "Fête du Travail",
        (8, 15): "Assomption",
        (11, 1): "Toussaint",
        (12, 25): "Noël",
    }

    ISLAMIC_HOLIDAYS: list[tuple[_date, str]] = [
        # Korité (Aïd el-Fitr)
        (_date(2024, 4, 10), "Korité (Aïd el-Fitr)"),
        (_date(2025, 3, 30), "Korité (Aïd el-Fitr)"),
        (_date(2026, 3, 20), "Korité (Aïd el-Fitr)"),
        (_date(2027, 3,  9), "Korité (Aïd el-Fitr)"),
        # Tabaski (Aïd el-Adha)
        (_date(2024, 6, 17), "Tabaski (Aïd el-Adha)"),
        (_date(2025, 6,  7), "Tabaski (Aïd el-Adha)"),
        (_date(2026, 5, 27), "Tabaski (Aïd el-Adha)"),
        (_date(2027, 5, 17), "Tabaski (Aïd el-Adha)"),
        # Tamkharit (Achoura)
        (_date(2024, 7, 16), "Tamkharit (Achoura)"),
        (_date(2025, 7,  5), "Tamkharit (Achoura)"),
        (_date(2026, 6, 24), "Tamkharit (Achoura)"),
        (_date(2027, 6, 14), "Tamkharit (Achoura)"),
        # Gamou (Mawlid)
        (_date(2024, 9, 15), "Gamou (Mawlid)"),
        (_date(2025, 9,  4), "Gamou (Mawlid)"),
        (_date(2026, 8, 25), "Gamou (Mawlid)"),
        (_date(2027, 8, 14), "Gamou (Mawlid)"),
    ]

    now   = datetime.now(timezone.utc)
    years = [now.year - 1, now.year, now.year + 1]
    seeded = 0

    # Migration préalable
    try:
        execute("ALTER TABLE excluded_days ADD COLUMN IF NOT EXISTS skip_collection BOOLEAN DEFAULT true")
    except Exception:
        pass

    # Jours fixes
    for year in years:
        for (month, day), name in FIXED_HOLIDAYS.items():
            try:
                d = _date(year, month, day)
                if d.weekday() >= 5:
                    continue  # week-end → déjà exclu automatiquement
                execute(
                    "INSERT INTO excluded_days (date, reason, skip_collection) "
                    "VALUES (%s, %s, %s) ON CONFLICT (date) DO NOTHING",
                    (d.isoformat(), name, True),
                )
                seeded += 1
            except Exception:
                pass

    # Jours islamiques
    for d, name in ISLAMIC_HOLIDAYS:
        if d.year not in years:
            continue
        if d.weekday() >= 5:
            continue
        try:
            execute(
                "INSERT INTO excluded_days (date, reason, skip_collection) "
                "VALUES (%s, %s, %s) ON CONFLICT (date) DO NOTHING",
                (d.isoformat(), name, True),
            )
            seeded += 1
        except Exception:
            pass

    if seeded:
        print(f"[startup] {seeded} jour(s) férié(s) ajouté(s) dans excluded_days.", flush=True)
    else:
        print("[startup] excluded_days déjà à jour (aucun nouveau jour férié).", flush=True)


def _init_tables():
    """Crée les tables manquantes au démarrage (idempotent)."""
    statements = [
        """CREATE TABLE IF NOT EXISTS reports (
            id          SERIAL PRIMARY KEY,
            matinale_id INTEGER REFERENCES matinales(id) ON DELETE CASCADE,
            reason      TEXT NOT NULL,
            comment     TEXT,
            status      TEXT DEFAULT 'pending',
            created_at  TIMESTAMPTZ DEFAULT NOW(),
            resolved_at TIMESTAMPTZ
        )""",
        """CREATE TABLE IF NOT EXISTS excluded_days (
            id         SERIAL PRIMARY KEY,
            date       DATE UNIQUE NOT NULL,
            reason     TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        )""",
        "CREATE INDEX IF NOT EXISTS idx_reports_matinale ON reports(matinale_id)",
        "CREATE INDEX IF NOT EXISTS idx_reports_status   ON reports(status)",
        # Index pour les LATERAL joins sur le dernier snapshot (critique pour les perfs)
        "CREATE INDEX IF NOT EXISTS idx_vs_matinale_snap ON view_snapshots(matinale_id, snapshot_at DESC)",
    ]
    for sql in statements:
        try:
            execute(sql)
        except Exception:
            pass  # Table déjà existante ou erreur non bloquante


# Les fonctions de refresh sont dans refresh.py (partagées avec l'endpoint admin)
# Alias pour les boucles background (sans force)
def _do_refresh_today() -> int:
    return do_refresh_today(force=False)

def _do_refresh_smart() -> int:
    return do_refresh_smart(force=False)


def _do_report_today() -> bool:
    """
    Envoie le rapport email des vues du jour aux abonnés actifs.
    Retourne True si l'email a été envoyé avec succès.
    """
    if not RESEND_KEY:
        print("[report-loop] RESEND_API_KEY manquante — rapport non envoyé.")
        return False

    now = datetime.now(timezone.utc)
    if now.weekday() >= 5:
        return False  # week-end

    subs = query("SELECT email FROM subscribers WHERE active = true")
    if not subs:
        print("[report-loop] Aucun abonné actif.")
        return False

    today = now.strftime("%Y-%m-%d")
    rows = query("""
        SELECT
            c.name AS channel_name, m.title, m.youtube_video_id,
            m.published_at, m.duration_seconds,
            last_vs.view_count, last_vs.like_count, last_vs.snapshot_at,
            first_vs.view_count AS view_count_first
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        LEFT JOIN view_snapshots last_vs ON last_vs.id = (
            SELECT id FROM view_snapshots WHERE matinale_id = m.id
            ORDER BY snapshot_at DESC LIMIT 1
        )
        LEFT JOIN view_snapshots first_vs ON first_vs.id = (
            SELECT id FROM view_snapshots WHERE matinale_id = m.id
            ORDER BY snapshot_at ASC LIMIT 1
        )
        WHERE DATE(m.published_at AT TIME ZONE 'UTC') = %s::date
        ORDER BY last_vs.view_count DESC NULLS LAST
    """, (today,))

    if not rows:
        print(f"[report-loop] Aucune matinale pour le {today}.")
        return False

    _fr_days   = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"]
    _fr_months = ["","janvier","février","mars","avril","mai","juin",
                  "juillet","août","septembre","octobre","novembre","décembre"]
    date_str = f"{_fr_days[now.weekday()]} {now.day} {_fr_months[now.month]} {now.year}"

    # Réutilise le builder HTML défini dans admin.py
    from routers.admin import _build_report_html
    html    = _build_report_html(rows, date_str)
    to_list = [s["email"] for s in subs]

    resp = req.post("https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_KEY}", "Content-Type": "application/json"},
        data=json.dumps({
            "from":    FROM_EMAIL,
            "to":      to_list,
            "subject": f"📺 MediaPulse · Vues matinales du {date_str}",
            "html":    html,
        }),
        timeout=15,
    )
    if resp.status_code in (200, 201):
        print(f"[report-loop] Rapport du {today} envoyé à {len(to_list)} abonné(s).")
        return True
    else:
        print(f"[report-loop] Erreur Resend {resp.status_code} : {resp.text[:200]}")
        return False


def _seconds_until(hour: int) -> float:
    """Secondes jusqu'à la prochaine occurrence de `hour`h00 UTC (min 60s)."""
    now    = datetime.now(timezone.utc)
    target = now.replace(hour=hour, minute=0, second=0, microsecond=0)
    if now >= target:
        target += timedelta(days=1)
    # Avance au prochain jour ouvré si week-end
    while target.weekday() >= 5:
        target += timedelta(days=1)
    return max((target - now).total_seconds(), 60)


# Executor dédié aux boucles background — séparé du pool FastAPI pour ne pas
# bloquer les routes HTTP quand refresh/report tournent en parallèle.
_BG_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=3, thread_name_prefix="mediapulse-bg"
)
# Executor séparé pour la détection (appels YouTube API potentiellement longs)
_DETECT_EXECUTOR = concurrent.futures.ThreadPoolExecutor(
    max_workers=1, thread_name_prefix="mediapulse-detect"
)


# ── Boucles asynchrones ────────────────────────────────────────────────────────

async def _refresh_today_loop():
    """Rafraîchit les vues J0 toutes les 15 min (5h–14h UTC, lun–ven)."""
    await asyncio.sleep(60)
    loop = asyncio.get_running_loop()
    while True:
        try:
            n = await loop.run_in_executor(_BG_EXECUTOR, _do_refresh_today)
            if n:
                print(f"[refresh-today] {n} snapshot(s) — {datetime.now(timezone.utc).strftime('%H:%M UTC')}")
        except Exception as e:
            print(f"[refresh-today] Erreur : {e}")
        await asyncio.sleep(_REFRESH_TODAY_S)


async def _refresh_smart_loop():
    """Rafraîchit les vues J0–J30 toutes les 30 min (5h–14h UTC, lun–ven)."""
    await asyncio.sleep(90)
    loop = asyncio.get_running_loop()
    while True:
        try:
            n = await loop.run_in_executor(_BG_EXECUTOR, _do_refresh_smart)
            if n:
                print(f"[refresh-smart] {n} snapshot(s) — {datetime.now(timezone.utc).strftime('%H:%M UTC')}")
        except Exception as e:
            print(f"[refresh-smart] Erreur : {e}")
        await asyncio.sleep(_REFRESH_SMART_S)


async def _refresh_durations_loop():
    """Rafraîchit les durées manquantes toutes les heures (vidéos live terminées)."""
    await asyncio.sleep(120)  # délai initial court pour couvrir les lives du matin
    loop = asyncio.get_running_loop()
    while True:
        try:
            n = await loop.run_in_executor(_BG_EXECUTOR, do_refresh_missing_durations)
            if n:
                print(f"[refresh-durations] {n} durée(s) mise(s) à jour — {datetime.now(timezone.utc).strftime('%H:%M UTC')}")
        except Exception as e:
            print(f"[refresh-durations] Erreur : {e}")
        await asyncio.sleep(60 * 60)  # toutes les heures


async def _detect_loop():
    """
    Détecte les nouvelles matinales toutes les 30 min (5h–13h UTC, lun–ven).
    Remplace le workflow GitHub Actions detect.yml.
    """
    print("[detect] Boucle démarrée — premier run dans 3 min.", flush=True)
    await asyncio.sleep(180)  # délai initial — laisse le temps à l'API de démarrer
    loop = asyncio.get_running_loop()
    while True:
        now = datetime.now(timezone.utc)
        if now.weekday() < 5 and _DETECT_START_H <= now.hour < _DETECT_END_H:
            def _run_detect():
                import detector as det
                import storage as col_storage
                col_storage.init_db()
                channels = det.sync_channels()
                return det.detect_matinales(channels, days=2)
            try:
                n = await loop.run_in_executor(_DETECT_EXECUTOR, _run_detect)
                ts = datetime.now(timezone.utc).strftime('%H:%M UTC')
                if n:
                    print(f"[detect] {n} nouvelle(s) matinale(s) — {ts}", flush=True)
                else:
                    print(f"[detect] 0 nouvelle (jour férié, déjà en base, ou aucun live terminé) — {ts}", flush=True)
            except Exception as e:
                import traceback
                print(f"[detect] ERREUR : {e}\n{traceback.format_exc()}", flush=True)
        else:
            # Hors fenêtre — log toutes les 2h pour confirmer que la boucle tourne
            now2 = datetime.now(timezone.utc)
            if now2.minute < 1:  # log uniquement aux heures rondes
                print(f"[detect] Hors fenêtre ({now2.strftime('%H:%M UTC')}, fenêtre 5h-13h lun-ven) — en attente.", flush=True)
        await asyncio.sleep(_DETECT_S)


async def _detect_live_loop():
    """
    Détecte les lives en cours toutes les 30 min (6h–10h UTC, lun–ven).
    Remplace le workflow GitHub Actions detect-live.yml.
    """
    print("[detect-live] Boucle démarrée — premier run dans 3m30.", flush=True)
    await asyncio.sleep(210)  # décalé de 30s par rapport à detect pour éviter la contention
    loop = asyncio.get_running_loop()
    while True:
        now = datetime.now(timezone.utc)
        if now.weekday() < 5 and _DETECT_LIVE_START_H <= now.hour < _DETECT_LIVE_END_H:
            def _run_detect_live():
                import detector as det
                import storage as col_storage
                col_storage.init_db()
                channels = det.sync_channels()
                return det.detect_live_matinales(channels)
            try:
                n = await loop.run_in_executor(_DETECT_EXECUTOR, _run_detect_live)
                ts = datetime.now(timezone.utc).strftime('%H:%M UTC')
                print(f"[detect-live] {n} live(s) détecté(s) — {ts}", flush=True)
            except Exception as e:
                import traceback
                print(f"[detect-live] ERREUR : {e}\n{traceback.format_exc()}", flush=True)
        await asyncio.sleep(_DETECT_S)


async def _report_loop():
    """Envoie le rapport email chaque jour ouvré à 13h00 UTC pile."""
    loop = asyncio.get_running_loop()
    while True:
        sleep_s = _seconds_until(_REPORT_HOUR_UTC)
        print(f"[report-loop] Prochain rapport dans {sleep_s/3600:.1f}h.")
        await asyncio.sleep(sleep_s)
        try:
            await loop.run_in_executor(_BG_EXECUTOR, _do_report_today)
        except Exception as e:
            print(f"[report-loop] Erreur : {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    print("[startup] Démarrage MediaPulse API...", flush=True)
    try:
        _init_tables()
        print("[startup] Tables OK", flush=True)
    except Exception as e:
        print(f"[startup] _init_tables erreur (non bloquante) : {e}", flush=True)
    try:
        _seed_holidays()
    except Exception as e:
        print(f"[startup] _seed_holidays erreur (non bloquante) : {e}", flush=True)
    tasks = [
        asyncio.create_task(_refresh_today_loop()),
        asyncio.create_task(_refresh_smart_loop()),
        asyncio.create_task(_refresh_durations_loop()),
        asyncio.create_task(_report_loop()),
        asyncio.create_task(_detect_loop()),
        asyncio.create_task(_detect_live_loop()),
    ]
    yield
    for t in tasks:
        t.cancel()
    _BG_EXECUTOR.shutdown(wait=False)
    _DETECT_EXECUTOR.shutdown(wait=False)
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="MediaPulse API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["*"],
)

app.include_router(stats.router)
app.include_router(admin.router)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Catch-all : logge l'erreur + renvoie CORS header même sur 500."""
    import traceback
    tb = traceback.format_exc()
    print(f"[500] {request.method} {request.url.path}\n{tb}", flush=True)
    return JSONResponse(
        status_code=500,
        content={"detail": str(exc), "type": type(exc).__name__},
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/debug/db")
def debug_db():
    """Test la connexion DB et retourne l'erreur si elle échoue."""
    import traceback
    try:
        from database import query
        rows = query("SELECT COUNT(*) AS n FROM channels")
        return {"status": "ok", "channels": rows[0]["n"]}
    except Exception as e:
        return {"status": "error", "detail": str(e), "trace": traceback.format_exc()}
