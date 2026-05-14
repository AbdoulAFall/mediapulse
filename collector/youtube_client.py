import os
import re
from datetime import datetime, timezone, timedelta
from typing import Iterator

import requests

API_KEY = os.environ.get("YOUTUBE_API_KEY", "")
BASE = "https://www.googleapis.com/youtube/v3"

# Plage matinale : 06h00–11h00 UTC+0 (Dakar)
# Élargie à 11h pour capturer les lives qui démarrent un peu en retard
MATINALE_START_H = 5
MATINALE_END_H = 11

# Durée minimale d'un live matinal (30 min) pour éliminer les courts clips
MIN_DURATION_S = 30 * 60


def _get(endpoint: str, **params) -> dict:
    params["key"] = API_KEY
    resp = requests.get(f"{BASE}/{endpoint}", params=params, timeout=15)
    resp.raise_for_status()
    return resp.json()


def resolve_channel(handle: str | None, channel_id: str | None) -> tuple[str, str]:
    """Returns (channel_id, uploads_playlist_id)."""
    if channel_id:
        data = _get("channels", id=channel_id, part="contentDetails")
    elif handle:
        clean = handle.lstrip("@")
        data = _get("channels", forHandle=clean, part="contentDetails")
    else:
        raise ValueError("Provide handle or channel_id")

    items = data.get("items", [])
    if not items:
        raise LookupError(f"Chaîne introuvable : handle={handle} id={channel_id}")

    item = items[0]
    return item["id"], item["contentDetails"]["relatedPlaylists"]["uploads"]


def _parse_duration(iso: str) -> int | None:
    """ISO 8601 duration → secondes. Ex: PT1H23M45S → 5025."""
    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso or "")
    if not m:
        return None
    h, mn, s = (int(x or 0) for x in m.groups())
    return h * 3600 + mn * 60 + s


def _is_in_matinale_window(dt_str: str) -> bool:
    """True si l'heure UTC est dans la plage matinale."""
    dt = datetime.fromisoformat(dt_str.replace("Z", "+00:00"))
    return MATINALE_START_H <= dt.hour < MATINALE_END_H


def fetch_recent_videos(playlist_id: str, since: datetime) -> Iterator[dict]:
    """
    Génère uniquement les lives (matinales) publiés après `since`.

    Filtre appliqué :
      1. Vidéo de type live (liveStreamingDetails présent)
      2. Heure de début du live dans la plage 05h–11h UTC
      3. Durée >= 30 minutes (élimine les courts clips)
    """
    page_token = None
    since_str = since.isoformat()

    while True:
        params = dict(playlistId=playlist_id, part="snippet", maxResults=50)
        if page_token:
            params["pageToken"] = page_token

        data = _get("playlistItems", **params)
        items = data.get("items", [])

        video_ids = []
        snippet_map = {}
        for item in items:
            sn = item["snippet"]
            vid = sn["resourceId"]["videoId"]
            pub = sn.get("publishedAt", "")
            if pub < since_str:
                return
            video_ids.append(vid)
            snippet_map[vid] = {"title": sn.get("title", ""), "published_at": pub}

        if video_ids:
            # Un seul appel pour contentDetails + liveStreamingDetails
            vdata = _get(
                "videos",
                id=",".join(video_ids),
                part="contentDetails,liveStreamingDetails",
            )
            for v in vdata.get("items", []):
                vid = v["id"]
                live = v.get("liveStreamingDetails")

                # Filtre 1 : doit être un live
                if not live:
                    continue

                duration = _parse_duration(v["contentDetails"].get("duration"))

                # Filtre 2 : durée minimale 30 min
                if duration and duration < MIN_DURATION_S:
                    continue

                # Heure de début réelle du live (plus fiable que published_at)
                start_time = (
                    live.get("actualStartTime")
                    or live.get("scheduledStartTime")
                    or snippet_map[vid]["published_at"]
                )

                # Filtre 3 : dans la plage horaire matinale
                if not _is_in_matinale_window(start_time):
                    continue

                yield {
                    "youtube_video_id": vid,
                    "title": snippet_map[vid]["title"],
                    "published_at": start_time,
                    "duration_seconds": duration,
                }

        page_token = data.get("nextPageToken")
        if not page_token:
            break


def fetch_video_stats(video_ids: list[str]) -> dict[str, dict]:
    """Retourne {video_id: {view_count, like_count, comment_count}}."""
    result = {}
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i:i + 50]
        data = _get("videos", id=",".join(batch), part="statistics")
        for item in data.get("items", []):
            s = item.get("statistics", {})
            result[item["id"]] = {
                "view_count": int(s.get("viewCount", 0)),
                "like_count": int(s.get("likeCount", 0)),
                "comment_count": int(s.get("commentCount", 0)),
            }
    return result


def is_matinale(published_at: str) -> bool:
    return _is_in_matinale_window(published_at)
