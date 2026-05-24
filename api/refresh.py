"""
Logique de refresh des vues YouTube.
Importé par main.py (boucles background) et admin.py (endpoint manuel).
"""
import os
import requests
from datetime import datetime, timezone, timedelta
from database import query, execute

YT_KEY  = os.environ.get("YOUTUBE_API_KEY", "")
YT_BASE = "https://www.googleapis.com/youtube/v3"

_REFRESH_START_H = 5
_REFRESH_END_H   = 14


def _fetch_and_insert(rows: list) -> int:
    """Appelle l'API YouTube et insère les snapshots. Retourne le nombre insérés."""
    if not rows:
        return 0

    video_ids = [r["youtube_video_id"] for r in rows]
    id_map    = {r["youtube_video_id"]: r["id"] for r in rows}
    inserted  = 0

    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        try:
            resp = requests.get(f"{YT_BASE}/videos", params={
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


def do_refresh_today(force: bool = False) -> int:
    """
    Rafraîchit les vues des matinales d'aujourd'hui non mises à jour depuis 15 min.
    force=True : ignore la plage horaire et le week-end (test manuel).
    """
    if not YT_KEY:
        return 0

    now = datetime.now(timezone.utc)

    if not force:
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

    return _fetch_and_insert(rows)


def do_refresh_missing() -> int:
    """
    Refresh one-shot pour les matinales sans aucun snapshot (quel que soit leur âge).
    Typiquement utilisé après un backfill ou l'ajout d'une nouvelle chaîne.
    Pas de limite de date — cible uniquement les vidéos avec 0 snapshot.
    """
    if not YT_KEY:
        return 0

    rows = query("""
        SELECT m.id, m.youtube_video_id
        FROM matinales m
        WHERE NOT EXISTS (
            SELECT 1 FROM view_snapshots vs WHERE vs.matinale_id = m.id
        )
        ORDER BY m.published_at DESC
    """)

    return _fetch_and_insert(rows)


def do_refresh_smart(force: bool = False) -> int:
    """
    Refresh 3 vitesses : J0–J3 (6h), J4–J30 (24h), J31+ ignoré.
    force=True : ignore la plage horaire et le week-end (test manuel).
    """
    if not YT_KEY:
        return 0

    now = datetime.now(timezone.utc)

    if not force:
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

    return _fetch_and_insert(rows)
