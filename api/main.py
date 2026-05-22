import os
import json
import asyncio
import concurrent.futures
import requests as req
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stats, admin
from database import execute, query

YT_KEY        = os.environ.get("YOUTUBE_API_KEY", "")
YT_BASE       = "https://www.googleapis.com/youtube/v3"
RESEND_KEY    = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL    = os.environ.get("REPORT_FROM_EMAIL", "MediaPulse <onboarding@resend.dev>")
DASHBOARD_URL = os.environ.get("DASHBOARD_URL", "https://mediapulse.vercel.app")

# Plage horaire (UTC) — 5h–14h lun–ven
_REFRESH_START_H    = 5
_REFRESH_END_H      = 14
_REFRESH_TODAY_S    = 15 * 60   # toutes les 15 min
_REFRESH_SMART_S    = 30 * 60   # toutes les 30 min
_REPORT_HOUR_UTC    = 13        # rapport email à 13h00 UTC


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


def _do_refresh_today() -> int:
    """
    Rafraîchit les vues des matinales d'aujourd'hui non mises à jour depuis 15 min.
    Retourne le nombre de snapshots insérés.
    Appelé depuis un thread (opérations I/O synchrones).
    """
    if not YT_KEY:
        return 0

    now = datetime.now(timezone.utc)

    # Hors plage horaire ou week-end → on skip
    if not (_REFRESH_START_H <= now.hour < _REFRESH_END_H):
        return 0
    if now.weekday() >= 5:
        return 0

    fifteen_min_ago = now - timedelta(minutes=15)

    rows = query("""
        SELECT m.id, m.youtube_video_id
        FROM matinales m
        WHERE DATE(m.published_at AT TIME ZONE 'UTC') = CURRENT_DATE
          AND (
              NOT EXISTS (SELECT 1 FROM view_snapshots vs WHERE vs.matinale_id = m.id)
              OR (
                  SELECT snapshot_at FROM view_snapshots
                  WHERE matinale_id = m.id
                  ORDER BY snapshot_at DESC LIMIT 1
              ) < %s
          )
    """, (fifteen_min_ago,))

    if not rows:
        return 0

    video_ids = [r["youtube_video_id"] for r in rows]
    id_map    = {r["youtube_video_id"]: r["id"] for r in rows}
    inserted  = 0

    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        try:
            resp = req.get(f"{YT_BASE}/videos", params={
                "id":   ",".join(batch),
                "part": "statistics",
                "key":  YT_KEY,
            }, timeout=15)
            if resp.status_code != 200:
                continue
            for item in resp.json().get("items", []):
                s      = item.get("statistics", {})
                mat_id = id_map.get(item["id"])
                if not mat_id:
                    continue
                execute("""
                    INSERT INTO view_snapshots (matinale_id, view_count, like_count, comment_count)
                    VALUES (%s, %s, %s, %s)
                """, (
                    mat_id,
                    int(s.get("viewCount",    0) or 0),
                    int(s.get("likeCount",    0) or 0),
                    int(s.get("commentCount", 0) or 0),
                ))
                inserted += 1
        except Exception:
            pass

    return inserted


def _do_refresh_smart() -> int:
    """
    Refresh intelligent 3 vitesses :
      J0–J3  (chaudes)  → pas de snapshot depuis 6h
      J4–J30 (tièdes)   → pas de snapshot depuis 24h
      J31+   (froides)  → ignorées
    """
    if not YT_KEY:
        return 0
    now = datetime.now(timezone.utc)
    if not (_REFRESH_START_H <= now.hour < _REFRESH_END_H):
        return 0
    if now.weekday() >= 5:
        return 0

    hot_since   = now - timedelta(days=3)
    warm_since  = now - timedelta(days=30)
    hot_thresh  = now - timedelta(hours=6)
    warm_thresh = now - timedelta(hours=24)

    rows = query("""
        SELECT m.id, m.youtube_video_id
        FROM matinales m
        WHERE
            (m.published_at >= %(hot_since)s AND (
                NOT EXISTS (SELECT 1 FROM view_snapshots vs WHERE vs.matinale_id = m.id)
                OR (SELECT snapshot_at FROM view_snapshots WHERE matinale_id = m.id
                    ORDER BY snapshot_at DESC LIMIT 1) < %(hot_thresh)s
            ))
            OR
            (m.published_at >= %(warm_since)s AND m.published_at < %(hot_since)s AND (
                NOT EXISTS (SELECT 1 FROM view_snapshots vs WHERE vs.matinale_id = m.id)
                OR (SELECT snapshot_at FROM view_snapshots WHERE matinale_id = m.id
                    ORDER BY snapshot_at DESC LIMIT 1) < %(warm_thresh)s
            ))
        ORDER BY m.published_at DESC
    """, {"hot_since": hot_since, "warm_since": warm_since,
          "hot_thresh": hot_thresh, "warm_thresh": warm_thresh})

    if not rows:
        return 0

    video_ids = [r["youtube_video_id"] for r in rows]
    id_map    = {r["youtube_video_id"]: r["id"] for r in rows}
    inserted  = 0

    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        try:
            resp = req.get(f"{YT_BASE}/videos", params={
                "id": ",".join(batch), "part": "statistics", "key": YT_KEY,
            }, timeout=15)
            if resp.status_code != 200:
                continue
            for item in resp.json().get("items", []):
                s = item.get("statistics", {})
                mat_id = id_map.get(item["id"])
                if not mat_id:
                    continue
                execute("""
                    INSERT INTO view_snapshots (matinale_id, view_count, like_count, comment_count)
                    VALUES (%s, %s, %s, %s)
                """, (mat_id,
                      int(s.get("viewCount",    0) or 0),
                      int(s.get("likeCount",    0) or 0),
                      int(s.get("commentCount", 0) or 0)))
                inserted += 1
        except Exception:
            pass

    return inserted


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
    _init_tables()
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
