import os
import asyncio
import requests as req
from contextlib import asynccontextmanager
from datetime import datetime, timezone, timedelta
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stats, admin
from database import execute, query

YT_KEY  = os.environ.get("YOUTUBE_API_KEY", "")
YT_BASE = "https://www.googleapis.com/youtube/v3"

# Plage horaire pendant laquelle on rafraîchit (UTC) — 5h–14h lun–ven
_REFRESH_START_H = 5
_REFRESH_END_H   = 14
_REFRESH_INTERVAL_S = 15 * 60   # 15 minutes


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


async def _refresh_loop():
    """
    Boucle asynchrone infinie : rafraîchit les vues toutes les 15 min.
    Tourne en arrière-plan dans le service Railway (plus fiable que GitHub Actions).
    """
    # Premier run après 1 min (laisse le temps à l'API de démarrer)
    await asyncio.sleep(60)
    while True:
        try:
            n = await asyncio.to_thread(_do_refresh_today)
            if n:
                print(f"[refresh-loop] {n} snapshot(s) insérés ({datetime.now(timezone.utc).strftime('%H:%M UTC')})")
        except Exception as e:
            print(f"[refresh-loop] Erreur : {e}")
        await asyncio.sleep(_REFRESH_INTERVAL_S)


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_tables()
    task = asyncio.create_task(_refresh_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


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
