"""
Détection et collecte des matinales pour toutes les chaînes actives.

Logique de sélection par journée :
  - Week-ends ignorés (pas de matinale samedi/dimanche)
  - Si title_hints configuré : filtre dur (le titre doit contenir au moins un hint)
  - Si pas de title_hints : scorer.pick_best() choisit selon heure attendue + titres historiques
"""
from collections import defaultdict
from datetime import datetime, timezone, timedelta

from channel_config import CHANNELS
import youtube_client as yt
import storage
import scorer
from holidays_sn import is_holiday


def _matches_hints(title: str, hints: list[str]) -> bool:
    """True si le titre contient au moins un des mots-clés configurés (insensible à la casse)."""
    title_lower = title.lower()
    return any(hint.lower() in title_lower for hint in hints)


def _is_weekend(day_str: str) -> bool:
    """True si la date (YYYY-MM-DD) est un samedi (5) ou dimanche (6)."""
    return datetime.strptime(day_str, "%Y-%m-%d").weekday() >= 5


def _skip_day(day_str: str) -> tuple[bool, str]:
    """Retourne (True, raison) si le jour doit être ignoré."""
    if _is_weekend(day_str):
        return True, "week-end"
    if is_holiday(day_str):
        return True, "jour férié sénégalais"
    if storage.is_excluded_day(day_str):
        return True, "jour exclu manuellement"
    return False, ""

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
                "matinale_start": ch.get("matinale_start", "07:00"),
                "matinale_end":   ch.get("matinale_end",   "12:00"),
                "title_hints": ch.get("title_hints", []),
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
    # On tronque à minuit pour éviter de couper le dernier jour en plein milieu
    since = (datetime.now(timezone.utc) - timedelta(days=days)).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    total_new = 0

    for ch in channels:
        print(f"  → {ch['name']} (matinale attendue vers {ch['matinale_start']} UTC)...")
        new_count = 0

        try:
            # Fenêtre spécifique à la chaîne (avec tolérance ±30 min)
            start_h, start_m = map(int, ch["matinale_start"].split(":"))
            end_h,   end_m   = map(int, ch["matinale_end"].split(":"))
            window_start = start_h * 60 + start_m - 30  # en minutes depuis minuit
            window_end   = end_h   * 60 + end_m   + 30

            def in_window(published_at: str) -> bool:
                from datetime import datetime, timezone
                dt = datetime.fromisoformat(published_at.replace("Z", "+00:00"))
                minutes = dt.hour * 60 + dt.minute
                return window_start <= minutes <= window_end

            # Collecte tous les lives candidats
            # Si title_hints configuré → pas de filtre horaire (les hints suffisent)
            # Si pas de title_hints → filtre horaire strict pour éviter les faux positifs
            has_hints = bool(ch.get("title_hints"))
            by_day: dict[str, list[dict]] = defaultdict(list)
            for video in yt.fetch_recent_videos(ch["playlist_id"], since):
                if not has_hints and not in_window(video["published_at"]):
                    continue
                day = video["published_at"][:10]
                by_day[day].append(video)

            # Pour chaque jour : sélectionner le meilleur candidat
            # On amorce l'historique avec les title_hints de la config
            historical_titles = storage.get_recent_matinale_titles(ch["db_id"])
            if not historical_titles and ch.get("title_hints"):
                historical_titles = ch["title_hints"]

            hints = ch.get("title_hints", [])

            for day, candidates in sorted(by_day.items()):
                # ── Filtre week-end et jours fériés ─────────────────────
                skip, reason = _skip_day(day)
                if skip:
                    print(f"     {day} : ignoré ({reason})")
                    continue

                # ── Filtre par title_hints (filtre dur si configuré) ─────
                if hints:
                    candidates = [c for c in candidates if _matches_hints(c["title"], hints)]
                    if not candidates:
                        print(f"     {day} : aucun live ne correspond aux title_hints → ignoré")
                        continue

                # ── Sélection du meilleur candidat ───────────────────────
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


def detect_live_matinales(channels: list[dict]) -> int:
    """
    Détecte les matinales actuellement en live via search.list (eventType=live).
    Coût : 100 unités × nombre de chaînes actives.

    Pour chaque chaîne :
      1. search.list → vidéos en live en ce moment
      2. videos.list → récupère actualStartTime + concurrentViewers
      3. Insère la matinale si pas déjà en base (published_at = actualStartTime)
      4. Snapshot le nombre de spectateurs simultanés
    """
    total_new = 0

    for ch in channels:
        print(f"  → {ch['name']} (recherche live en cours)...", end=" ", flush=True)
        try:
            live_items = yt.search_live_videos(ch["channel_id"])
            if not live_items:
                print("aucun live.")
                continue

            video_ids = [v["video_id"] for v in live_items]
            details   = yt.fetch_live_details(video_ids)

            found = 0
            for vid in details:
                start_time = vid["actualStartTime"] or vid["scheduledStartTime"]
                if not start_time:
                    continue

                if not yt._is_in_matinale_window(start_time):
                    continue

                day = start_time[:10]
                skip, reason = _skip_day(day)
                if skip:
                    continue

                hints = ch.get("title_hints", [])
                if hints and not _matches_hints(vid["title"], hints):
                    continue

                video_data = {
                    "youtube_video_id": vid["id"],
                    "title":            vid["title"],
                    "published_at":     start_time,
                    "duration_seconds": None,
                }
                matinale_id = storage.insert_matinale(ch["db_id"], video_data)
                if matinale_id:
                    total_new += 1
                    found += 1
                else:
                    matinale_id = storage.get_matinale_id_by_video_id(vid["id"])

                if matinale_id and vid.get("concurrentViewers"):
                    storage.insert_snapshot(matinale_id, {
                        "concurrent_viewers": int(vid["concurrentViewers"]),
                    })

            viewers_info = ", ".join(
                f"{v['title'][:30]}… ({v.get('concurrentViewers','?')} viewers)"
                for v in details if v.get("concurrentViewers")
            )
            print(f"{found} nouveau(x) | {viewers_info or 'pas de viewers'}")

        except Exception as e:
            print(f"ERREUR : {e}")

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


def refresh_view_counts_smart():
    """
    Refresh intelligent à 3 vitesses pour minimiser les appels API YouTube :

      J0–J3   (chaudes)  → snapshot si absent ou vieux de plus de 6h
      J4–J30  (tièdes)   → snapshot si absent ou vieux de plus de 24h
      J31+    (froides)  → ignorées (vues quasi-stables)

    En pratique : ~10–30 vidéos par run vs 300 avec refresh_view_counts(60).
    """
    rows = storage.get_matinale_ids_tiered()
    if not rows:
        print("  Aucune mise à jour nécessaire (toutes les vues sont à jour).")
        return

    hot   = [r for r in rows if r["age_days"] <= 3]
    warm  = [r for r in rows if 3 < r["age_days"] <= 30]
    print(f"  → {len(hot)} vidéo(s) chaude(s) (J0–J3) + {len(warm)} tiède(s) (J4–J30) à rafraîchir")

    video_ids = [r["youtube_video_id"] for r in rows]
    id_map    = {r["youtube_video_id"]: r["id"] for r in rows}

    try:
        stats = yt.fetch_video_stats(video_ids)
        for vid_id, s in stats.items():
            storage.insert_snapshot(id_map[vid_id], s)
        print(f"     {len(stats)} snapshot(s) enregistré(s)")
    except Exception as e:
        print(f"     ERREUR : {e}")


def refresh_today_views():
    """Snapshot des vues pour les matinales d'aujourd'hui (refresh toutes les 15 min)."""
    rows = storage.get_todays_matinale_ids()
    if not rows:
        print("  Aucune matinale aujourd'hui à actualiser.")
        return

    video_ids = [r["youtube_video_id"] for r in rows]
    id_map = {r["youtube_video_id"]: r["id"] for r in rows}

    print(f"  → Refresh vues J0 pour {len(video_ids)} vidéo(s)...")
    try:
        stats = yt.fetch_video_stats(video_ids)
        for vid_id, s in stats.items():
            storage.insert_snapshot(id_map[vid_id], s)
        print(f"     {len(stats)} snapshot(s) enregistré(s)")
    except Exception as e:
        print(f"     ERREUR : {e}")
