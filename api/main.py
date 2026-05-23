import os
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
from refresh import do_refresh_today, do_refresh_smart

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
    max_workers=2, thread_name_prefix="mediapulse-bg"
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
    tasks = [
        asyncio.create_task(_refresh_today_loop()),
        asyncio.create_task(_refresh_smart_loop()),
        asyncio.create_task(_report_loop()),
    ]
    yield
    for t in tasks:
        t.cancel()
    _BG_EXECUTOR.shutdown(wait=False)
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="MediaPulse API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST", "PATCH", "DELETE"],
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
