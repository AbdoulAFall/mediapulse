import os
import psycopg2
import psycopg2.extras
from psycopg2 import pool

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
            connect_timeout=10,
        )
    return _pool


def query(sql: str, params=()) -> list[dict]:
    p = get_pool()
    try:
        conn = p.getconn()
    except pool.PoolError:
        raise RuntimeError("Pool épuisé — réessaie dans quelques secondes.")
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
    p = get_pool()
    try:
        conn = p.getconn()
    except pool.PoolError:
        raise RuntimeError("Pool épuisé — réessaie dans quelques secondes.")
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or None)
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        p.putconn(conn)
