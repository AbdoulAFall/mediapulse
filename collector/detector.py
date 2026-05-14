"""
Détection et collecte des matinales pour toutes les chaînes actives.
"""
from datetime import datetime, timezone, timedelta

from channel_config import CHANNELS
import youtube_client as yt
import storage


LOOKBACK_DAYS = 60  # fenêtre de collecte


def sync_channels():
    """
    Résout les channel_id/playlist_id manquants et les persiste en base.
    Retourne la liste des chaînes actives avec leurs infos DB.
    """
    active = []
    for ch in CHANNELS:
        if not ch["active"]:
            continue
        print(f"  → Résolution {ch['name']}...", end=" ", flush=True)
        try:
            resolved_id, playlist_id = yt.resolve_channel(
                ch.get("handle"), ch.get("channel_id")
            )
            db_id = storage.upsert_channel(
                ch["name"], ch.get("handle"), resolved_id, playlist_id
            )
            print(f"OK (id={resolved_id})")
            active.append({
                "db_id": db_id,
                "name": ch["name"],
                "channel_id": resolved_id,
                "playlist_id": playlist_id,
            })
        except Exception as e:
            print(f"ERREUR : {e}")
    return active


def detect_matinales(channels: list[dict]) -> int:
    """
    Parcourt les 60 derniers jours pour chaque chaîne,
    filtre les vidéos publiées 06h–10h UTC, les insère en base.
    Retourne le nombre de nouvelles matinales détectées.
    """
    since = datetime.now(timezone.utc) - timedelta(days=LOOKBACK_DAYS)
    total_new = 0

    for ch in channels:
        print(f"  → {ch['name']} : recherche matinales depuis {since.date()}...")
        new_count = 0
        try:
            for video in yt.fetch_recent_videos(ch["playlist_id"], since):
                if not yt.is_matinale(video["published_at"]):
                    continue
                matinale_id = storage.insert_matinale(ch["db_id"], video)
                if matinale_id is not None:
                    new_count += 1
            print(f"     {new_count} nouvelle(s) matinale(s)")
            total_new += new_count
        except Exception as e:
            print(f"     ERREUR : {e}")

    return total_new


def refresh_view_counts():
    """
    Prend un snapshot des vues pour toutes les matinales des 60 derniers jours
    qui n'ont pas été mises à jour depuis 6h.
    """
    rows = storage.get_matinale_ids_last_n_days(LOOKBACK_DAYS)
    if not rows:
        print("  Aucune mise à jour nécessaire.")
        return

    video_ids = [r["youtube_video_id"] for r in rows]
    id_map = {r["youtube_video_id"]: r["id"] for r in rows}

    print(f"  → Refresh vues pour {len(video_ids)} vidéo(s)...")
    try:
        stats = yt.fetch_video_stats(video_ids)
        for vid_id, s in stats.items():
            storage.insert_snapshot(id_map[vid_id], s)
        print(f"     {len(stats)} snapshot(s) enregistré(s)")
    except Exception as e:
        print(f"     ERREUR : {e}")
