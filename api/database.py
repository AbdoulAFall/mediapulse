import os
import psycopg2
import psycopg2.extras
from psycopg2 import pool, OperationalError, InterfaceError

_pool = None


def get_pool():
    global _pool
    if _pool is None:
        url = os.environ["DATABASE_URL"]
        if "sslmode" not in url:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}sslmode=require"
        _pool = pool.ThreadedConnectionPool(
            1, 10,
            dsn=url,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=5,
            # Annule toute requête qui pend > 30 s (Supabase lent / réseau)
            options="-c statement_timeout=30000",
        )
    return _pool


def _getconn():
    """Retourne une connexion vivante depuis le pool. Remplace les connexions périmées."""
    p = get_pool()
    try:
        conn = p.getconn()
    except pool.PoolError:
        raise RuntimeError("Pool de connexions épuisé — réessaie dans quelques secondes.")

    # Ping léger pour détecter les connexions périmées (idle timeout Supabase ~10 min)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
    except (OperationalError, InterfaceError):
        try:
            p.putconn(conn, close=True)
        except Exception:
            pass
        try:
            conn = p.getconn()
        except pool.PoolError:
            raise RuntimeError("Pool épuisé après reconnexion.")

    return conn, p


def query(sql: str, params=()) -> list[dict]:
    conn, p = _getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or None)
            return [dict(r) for r in cur.fetchall()]
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)


def execute(sql: str, params=()):
    conn, p = _getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or None)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)
