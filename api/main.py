import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stats

app = FastAPI(title="MediaPulse API", version="1.0.0")


@app.on_event("startup")
async def startup():
    """Crée les tables si elles n'existent pas."""
    try:
        from database import get_pool
        p = get_pool()
        conn = p.getconn()
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS channels (
                    id SERIAL PRIMARY KEY, name TEXT NOT NULL,
                    handle TEXT, channel_id TEXT UNIQUE NOT NULL,
                    playlist_id TEXT, active INTEGER DEFAULT 1, resolved_at TIMESTAMPTZ
                );
                CREATE TABLE IF NOT EXISTS matinales (
                    id SERIAL PRIMARY KEY, channel_id INTEGER REFERENCES channels(id),
                    youtube_video_id TEXT UNIQUE NOT NULL, title TEXT,
                    duration_seconds INTEGER, published_at TIMESTAMPTZ NOT NULL,
                    detected_at TIMESTAMPTZ DEFAULT NOW()
                );
                CREATE TABLE IF NOT EXISTS view_snapshots (
                    id SERIAL PRIMARY KEY, matinale_id INTEGER REFERENCES matinales(id),
                    snapshot_at TIMESTAMPTZ DEFAULT NOW(), view_count INTEGER,
                    like_count INTEGER, comment_count INTEGER
                );
            """)
        conn.commit()
        p.putconn(conn)
        print("✓ Base de données initialisée")
    except Exception as e:
        print(f"⚠ Erreur initialisation DB : {e}")

# CORS — autoriser le frontend Vercel + localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"],
)

app.include_router(stats.router)


@app.get("/health")
def health():
    return {"status": "ok"}
