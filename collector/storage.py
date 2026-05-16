import os
from datetime import datetime, timedelta, timezone

import psycopg2
import psycopg2.extras

DATABASE_URL = os.environ.get("DATABASE_URL", "")


def get_conn():
    url = DATABASE_URL
    # Supabase exige SSL — on l'ajoute si absent
    if "sslmode" not in url:
        sep = "&" if "?" in url else "?"
        url = f"{url}{sep}sslmode=require"
    return psycopg2.connect(url, cursor_factory=psycopg2.extras.RealDictCursor)


def init_db():
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                CREATE TABLE IF NOT EXISTS channels (
                    id          SERIAL PRIMARY KEY,
                    name        TEXT NOT NULL,
                    handle      TEXT,
                    channel_id  TEXT UNIQUE NOT NULL,
                    playlist_id TEXT,
                    active      INTEGER DEFAULT 1,
                    resolved_at TIMESTAMPTZ
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS matinales (
                    id               SERIAL PRIMARY KEY,
                    channel_id       INTEGER REFERENCES channels(id),
                    youtube_video_id TEXT UNIQUE NOT NULL,
                    title            TEXT,
                    duration_seconds INTEGER,
                    published_at     TIMESTAMPTZ NOT NULL,
                    detected_at      TIMESTAMPTZ DEFAULT NOW()
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS view_snapshots (
                    id            SERIAL PRIMARY KEY,
                    matinale_id   INTEGER REFERENCES matinales(id),
                    snapshot_at   TIMESTAMPTZ DEFAULT NOW(),
                    view_count    INTEGER,
                    like_count    INTEGER,
                    comment_count INTEGER
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS reports (
                    id          SERIAL PRIMARY KEY,
                    matinale_id INTEGER REFERENCES matinales(id) ON DELETE CASCADE,
                    reason      TEXT NOT NULL,
                    comment     TEXT,
                    status      TEXT DEFAULT 'pending',
                    created_at  TIMESTAMPTZ DEFAULT NOW(),
                    resolved_at TIMESTAMPTZ
                );
            """)
            cur.execute("""
                CREATE TABLE IF NOT EXISTS excluded_days (
                    id         SERIAL PRIMARY KEY,
                    date       DATE UNIQUE NOT NULL,
                    reason     TEXT,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                );
            """)
            cur.execute("CREATE INDEX IF NOT EXISTS idx_matinales_channel ON matinales(channel_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_matinales_published ON matinales(published_at);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_snapshots_matinale ON view_snapshots(matinale_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_reports_matinale ON reports(matinale_id);")
            cur.execute("CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);")
        conn.commit()


def upsert_channel(name: str, handle: str | None, channel_id: str, playlist_id: str) -> int:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO channels (name, handle, channel_id, playlist_id, resolved_at)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (channel_id) DO UPDATE SET
                    playlist_id = EXCLUDED.playlist_id,
                    resolved_at = EXCLUDED.resolved_at
                RETURNING id
            """, (name, handle, channel_id, playlist_id, datetime.now(timezone.utc)))
            row = cur.fetchone()
        conn.commit()
        return row["id"]


def insert_matinale(channel_db_id: int, video: dict) -> int | None:
    """Retourne l'id inséré, ou None si déjà existant (même vidéo ou même chaîne/jour)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            # 1. Doublon exact (même video_id)
            cur.execute(
                "SELECT id FROM matinales WHERE youtube_video_id = %s",
                (video["youtube_video_id"],)
            )
            if cur.fetchone():
                return None

            # 2. Une matinale existe déjà pour cette chaîne ce jour-là
            cur.execute("""
                SELECT id FROM matinales
                WHERE channel_id = %s
                  AND DATE(published_at AT TIME ZONE 'UTC') = DATE(%s::timestamptz AT TIME ZONE 'UTC')
            """, (channel_db_id, video["published_at"]))
            if cur.fetchone():
                return None

            cur.execute("""
                INSERT INTO matinales (channel_id, youtube_video_id, title, duration_seconds, published_at)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (
                channel_db_id,
                video["youtube_video_id"],
                video["title"],
                video.get("duration_seconds"),
                video["published_at"],
            ))
            row = cur.fetchone()
        conn.commit()
        return row["id"]


def insert_snapshot(matinale_db_id: int, stats: dict):
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO view_snapshots (matinale_id, view_count, like_count, comment_count)
                VALUES (%s, %s, %s, %s)
            """, (
                matinale_db_id,
                stats.get("view_count"),
                stats.get("like_count"),
                stats.get("comment_count"),
            ))
        conn.commit()


def get_matinales_for_stats(days: int = 60) -> list:
    since = datetime.now(timezone.utc) - timedelta(days=days)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    m.id,
                    c.name AS channel_name,
                    m.youtube_video_id,
                    m.title,
                    m.published_at,
                    m.duration_seconds,
                    vs.view_count,
                    vs.like_count,
                    vs.snapshot_at
                FROM matinales m
                JOIN channels c ON c.id = m.channel_id
                LEFT JOIN view_snapshots vs ON vs.id = (
                    SELECT id FROM view_snapshots
                    WHERE matinale_id = m.id
                    ORDER BY snapshot_at DESC LIMIT 1
                )
                WHERE m.published_at >= %s
                ORDER BY m.published_at DESC
            """, (since,))
            return cur.fetchall()


def get_recent_matinale_titles(channel_db_id: int, limit: int = 30) -> list[str]:
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT title FROM matinales
                WHERE channel_id = %s AND title IS NOT NULL
                ORDER BY published_at DESC LIMIT %s
            """, (channel_db_id, limit))
            return [r["title"] for r in cur.fetchall()]


def get_matinale_ids_last_n_days(days: int = 60) -> list:
    """Matinales des N derniers jours sans snapshot récent (seuil 6h)."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    six_hours_ago = datetime.now(timezone.utc) - timedelta(hours=6)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT m.id, m.youtube_video_id
                FROM matinales m
                WHERE m.published_at >= %s
                  AND (
                      NOT EXISTS (SELECT 1 FROM view_snapshots vs WHERE vs.matinale_id = m.id)
                      OR (
                          SELECT snapshot_at FROM view_snapshots
                          WHERE matinale_id = m.id
                          ORDER BY snapshot_at DESC LIMIT 1
                      ) < %s
                  )
            """, (since, six_hours_ago))
            return cur.fetchall()


def is_excluded_day(day_str: str) -> bool:
    """Vérifie si le jour est exclu manuellement (table excluded_days)."""
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT 1 FROM excluded_days WHERE date = %s::date",
                (day_str,)
            )
            return cur.fetchone() is not None


def get_todays_matinale_ids() -> list:
    """Matinales d'aujourd'hui sans snapshot depuis moins de 15 min — pour refresh fréquent."""
    fifteen_min_ago = datetime.now(timezone.utc) - timedelta(minutes=15)
    with get_conn() as conn:
        with conn.cursor() as cur:
            cur.execute("""
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
            return cur.fetchall()
