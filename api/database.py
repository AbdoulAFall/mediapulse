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
        _pool = pool.SimpleConnectionPool(
            1, 10,
            dsn=url,
            cursor_factory=psycopg2.extras.RealDictCursor,
            connect_timeout=10,
        )
    return _pool


def query(sql: str, params=()) -> list[dict]:
    p = get_pool()
    conn = p.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or None)
            return [dict(r) for r in cur.fetchall()]
    finally:
        p.putconn(conn)


def execute(sql: str, params=()):
    p = get_pool()
    conn = p.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(sql, params or None)
        conn.commit()
    finally:
        p.putconn(conn)
