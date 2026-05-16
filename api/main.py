import os
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routers import stats, admin
from database import execute


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


@asynccontextmanager
async def lifespan(app: FastAPI):
    _init_tables()
    yield


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
