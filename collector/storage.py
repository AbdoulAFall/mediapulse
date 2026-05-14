import sqlite3
from pathlib import Path
from datetime import datetime

DB_PATH = Path(__file__).parent.parent / "mediapulse.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_conn() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS channels (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                name        TEXT NOT NULL,
                handle      TEXT,
                channel_id  TEXT UNIQUE NOT NULL,
                playlist_id TEXT,
                active      INTEGER DEFAULT 1,
                resolved_at TEXT
            );

            CREATE TABLE IF NOT EXISTS matinales (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                channel_id       INTEGER REFERENCES channels(id),
                youtube_video_id TEXT UNIQUE NOT NULL,
                title            TEXT,
                duration_seconds INTEGER,
                published_at     TEXT NOT NULL,
                detected_at      TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS view_snapshots (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                matinale_id INTEGER REFERENCES matinales(id),
                snapshot_at TEXT DEFAULT (datetime('now')),
                view_count  INTEGER,
                like_count  INTEGER,
                comment_count INTEGER
            );

            CREATE INDEX IF NOT EXISTS idx_matinales_channel ON matinales(channel_id);
            CREATE INDEX IF NOT EXISTS idx_matinales_published ON matinales(published_at);
            CREATE INDEX IF NOT EXISTS idx_snapshots_matinale ON view_snapshots(matinale_id);
        """)


def upsert_channel(name: str, handle: str | None, channel_id: str, playlist_id: str) -> int:
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO channels (name, handle, channel_id, playlist_id, resolved_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(channel_id) DO UPDATE SET
                playlist_id = excluded.playlist_id,
                resolved_at = excluded.resolved_at
        """, (name, handle, channel_id, playlist_id, datetime.utcnow().isoformat()))
        row = conn.execute("SELECT id FROM channels WHERE channel_id = ?", (channel_id,)).fetchone()
        return row["id"]


def insert_matinale(channel_db_id: int, video: dict) -> int | None:
    """Returns the matinale db id, or None if already exists."""
    with get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM matinales WHERE youtube_video_id = ?",
            (video["youtube_video_id"],)
        ).fetchone()
        if existing:
            return None
        cur = conn.execute("""
            INSERT INTO matinales (channel_id, youtube_video_id, title, duration_seconds, published_at)
            VALUES (?, ?, ?, ?, ?)
        """, (
            channel_db_id,
            video["youtube_video_id"],
            video["title"],
            video.get("duration_seconds"),
            video["published_at"],
        ))
        return cur.lastrowid


def insert_snapshot(matinale_db_id: int, stats: dict):
    with get_conn() as conn:
        conn.execute("""
            INSERT INTO view_snapshots (matinale_id, view_count, like_count, comment_count)
            VALUES (?, ?, ?, ?)
        """, (
            matinale_db_id,
            stats.get("view_count"),
            stats.get("like_count"),
            stats.get("comment_count"),
        ))


def get_matinales_for_stats(days: int = 60) -> list[sqlite3.Row]:
    with get_conn() as conn:
        return conn.execute("""
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
            WHERE m.published_at >= datetime('now', ?)
            ORDER BY m.published_at DESC
        """, (f"-{days} days",)).fetchall()


def get_recent_matinale_titles(channel_db_id: int, limit: int = 30) -> list[str]:
    """Retourne les titres des dernières matinales confirmées pour une chaîne."""
    with get_conn() as conn:
        rows = conn.execute("""
            SELECT title FROM matinales
            WHERE channel_id = ? AND title IS NOT NULL
            ORDER BY published_at DESC LIMIT ?
        """, (channel_db_id, limit)).fetchall()
        return [r["title"] for r in rows]


def get_matinale_ids_last_n_days(days: int = 60) -> list[sqlite3.Row]:
    """Returns (id, youtube_video_id) for matinales without a recent snapshot."""
    with get_conn() as conn:
        return conn.execute("""
            SELECT m.id, m.youtube_video_id
            FROM matinales m
            WHERE m.published_at >= datetime('now', ?)
              AND (
                  NOT EXISTS (SELECT 1 FROM view_snapshots vs WHERE vs.matinale_id = m.id)
                  OR (
                      SELECT snapshot_at FROM view_snapshots
                      WHERE matinale_id = m.id
                      ORDER BY snapshot_at DESC LIMIT 1
                  ) < datetime('now', '-6 hours')
              )
        """, (f"-{days} days",)).fetchall()
