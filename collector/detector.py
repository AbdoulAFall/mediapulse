"""
Détection et collecte des matinales pour toutes les chaînes actives.

Logique de sélection par journée :
  - Un seul live dans la fenêtre → c'est la matinale
  - Plusieurs lives → scorer.pick_best() choisit selon heure attendue + titres historiques
"""
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from channel_config import CHANNELS
import youtube_client as yt
import storage
import scorer

DEFAULT_LOOKBACK_DAYS = 60


def sync_channels() -> list[dict]:
    """Résout channel_id/playlist_id et persiste en base. Retourne les chaînes actives."""
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
                "matinale_start": ch.get("matinale_start", "08:00"),
            })
        except Exception as e:
            print(f"ERREUR : {e}")
    return active


def detect_matinales(channels: list[dict], days: int = DEFAULT_LOOKBACK_DAYS) -> int:
    """
    Pour chaque chaîne, collecte tous les lives de la fenêtre matinale
    sur les 60 derniers jours, groupe par jour, sélectionne le meilleur
    candidat et l'insère en base.
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    total_new = 0

    for ch in channels:
        print(f"  → {ch['name']} (matinale attendue vers {ch['matinale_start']} UTC)...")
        new_count = 0

        try:
            # Collecte tous les lives candidats
            by_day: dict[str, list[dict]] = defaultdict(list)
            for video in yt.fetch_recent_videos(ch["playlist_id"], since):
                day = video["published_at"][:10]
                by_day[day].append(video)

            # Pour chaque jour : sélectionner le meilleur candidat
            historical_titles = storage.get_recent_matinale_titles(ch["db_id"])

            for day, candidates in sorted(by_day.items()):
                if len(candidates) > 1:
                    print(f"     {day} : {len(candidates)} lives candidats → scoring...")
                    best = scorer.pick_best(candidates, ch["matinale_start"], historical_titles)
                else:
                    best = candidates[0]

                matinale_id = storage.insert_matinale(ch["db_id"], best)
                if matinale_id is not None:
                    new_count += 1
                    # Enrichit l'historique pour les jours suivants
                    historical_titles = [best["title"]] + historical_titles[:29]

            print(f"     {new_count} nouvelle(s) matinale(s) sur {len(by_day)} jour(s)")
            total_new += new_count

        except Exception as e:
            print(f"     ERREUR : {e}")

    return total_new


def refresh_view_counts(days: int = DEFAULT_LOOKBACK_DAYS):
    """Snapshot des vues pour les matinales des N derniers jours non mises à jour depuis 6h."""
    rows = storage.get_matinale_ids_last_n_days(days)
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
