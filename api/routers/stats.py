from fastapi import APIRouter, Query, HTTPException
from datetime import datetime, timedelta, timezone
from collections import defaultdict
from database import query
from models import StatsResponse, ChannelStats, Matinale, TimelinePoint

router = APIRouter(prefix="/api", tags=["stats"])


def _since(days: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(days=days)


def _fmt_duration(s: int | None) -> str | None:
    if not s or s <= 0:
        return None
    return f"{s // 3600}h{(s % 3600) // 60:02d}m"


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M")


@router.get("/channels")
def get_channels():
    return query("SELECT id, name, handle, active FROM channels ORDER BY name")


@router.get("/stats", response_model=StatsResponse)
def get_stats(days: int = Query(60, ge=1, le=730)):
    try:
        since = _since(days)
        rows = query("""
        SELECT
            c.name,
            COUNT(m.id)            AS matinales_count,
            COALESCE(SUM(vs.view_count), 0) AS total_views,
            COALESCE(AVG(vs.view_count), 0) AS avg_views,
            COALESCE(SUM(vs.like_count), 0) AS total_likes
        FROM channels c
        LEFT JOIN matinales m ON m.channel_id = c.id AND m.published_at >= %s
        LEFT JOIN view_snapshots vs ON vs.id = (
            SELECT id FROM view_snapshots
            WHERE matinale_id = m.id
            ORDER BY snapshot_at DESC LIMIT 1
        )
        WHERE c.active = 1
        GROUP BY c.name
        ORDER BY total_views DESC
    """, (since,))

        channels = [
            ChannelStats(
                name=r["name"],
                matinales_count=r["matinales_count"] or 0,
                total_views=int(r["total_views"] or 0),
                avg_views=int(r["avg_views"] or 0),
                total_likes=int(r["total_likes"] or 0),
            )
            for r in rows
        ]
        return StatsResponse(
            channels=channels,
            total_matinales=sum(c.matinales_count for c in channels),
            total_views=sum(c.total_views for c in channels),
            period_days=days,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/matinales", response_model=list[Matinale])
def get_matinales(
    days: int = Query(60, ge=1, le=730),
    channel: str | None = Query(None),
    limit: int = Query(200, ge=1, le=1000),
):
    since = _since(days)
    filters = ["m.published_at >= %s"]
    params: list = [since]

    if channel:
        filters.append("c.name = %s")
        params.append(channel)

    where = " AND ".join(filters)
    rows = query(f"""
        SELECT
            m.id,
            c.name AS channel,
            m.title,
            m.published_at,
            m.duration_seconds,
            m.youtube_video_id,
            vs.view_count,
            vs.like_count
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        LEFT JOIN view_snapshots vs ON vs.id = (
            SELECT id FROM view_snapshots
            WHERE matinale_id = m.id
            ORDER BY snapshot_at DESC LIMIT 1
        )
        WHERE {where}
        ORDER BY m.published_at DESC
        LIMIT %s
    """, (*params, limit))

    result = []
    for r in rows:
        pub = r["published_at"]
        if pub.tzinfo is None:
            pub = pub.replace(tzinfo=timezone.utc)
        dur = r["duration_seconds"]
        fin_dt = pub + timedelta(seconds=dur) if dur else None
        result.append(Matinale(
            id=r["id"],
            channel=r["channel"],
            title=r["title"],
            published_at=pub,
            duration_seconds=dur,
            debut=_fmt_time(pub),
            fin=_fmt_time(fin_dt) if fin_dt else None,
            duree=_fmt_duration(dur),
            view_count=r["view_count"],
            like_count=r["like_count"],
            youtube_url=f"https://www.youtube.com/watch?v={r['youtube_video_id']}",
        ))
    return result


@router.get("/schedule")
def get_schedule(days: int = Query(60, ge=1, le=730)):
    """Horaires moyens de début/fin par chaîne sur la période."""
    since = _since(days)
    rows = query("""
        SELECT
            c.name AS channel,
            AVG(
                EXTRACT(HOUR FROM m.published_at) * 60 +
                EXTRACT(MINUTE FROM m.published_at)
            ) AS avg_start_min,
            AVG(
                EXTRACT(HOUR FROM m.published_at) * 60 +
                EXTRACT(MINUTE FROM m.published_at) +
                COALESCE(m.duration_seconds, 0) / 60.0
            ) AS avg_end_min,
            AVG(m.duration_seconds)  AS avg_duration_s,
            STDDEV(
                EXTRACT(HOUR FROM m.published_at) * 60 +
                EXTRACT(MINUTE FROM m.published_at)
            ) AS stddev_start_min,
            COUNT(m.id) AS episode_count
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        WHERE m.published_at >= %s
          AND c.active = 1
          AND m.duration_seconds IS NOT NULL
          AND m.duration_seconds > 0
        GROUP BY c.name
        ORDER BY avg_start_min ASC
    """, (since,))

    result = []
    for r in rows:
        start = int(r["avg_start_min"] or 0)
        end   = int(r["avg_end_min"]   or 0)
        dur   = int(r["avg_duration_s"] or 0)
        std   = float(r["stddev_start_min"] or 0)
        result.append({
            "channel":        r["channel"],
            "avg_start":      f"{start // 60:02d}:{start % 60:02d}",
            "avg_end":        f"{end   // 60:02d}:{end   % 60:02d}",
            "avg_start_min":  start,
            "avg_end_min":    end,
            "avg_duration":   _fmt_duration(dur),
            "punctuality_min": round(std, 1),
            "episode_count":  r["episode_count"],
        })
    return result


@router.get("/views/evolution")
def get_views_evolution(date: str | None = Query(None)):
    """
    Retourne l'évolution des vues toutes les 15 min pour chaque matinale d'une journée.
    date : format YYYY-MM-DD (défaut = aujourd'hui UTC)
    """
    if date is None:
        date = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    try:
        # Validation format
        datetime.strptime(date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de date invalide. Utiliser YYYY-MM-DD.")

    rows = query("""
        SELECT
            m.id            AS matinale_id,
            c.name          AS channel,
            m.title,
            m.youtube_video_id,
            m.published_at,
            vs.snapshot_at,
            vs.view_count,
            vs.like_count,
            vs.comment_count
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        JOIN view_snapshots vs ON vs.matinale_id = m.id
        WHERE DATE(m.published_at AT TIME ZONE 'UTC') = %s::date
        ORDER BY m.id, vs.snapshot_at ASC
    """, (date,))

    # Groupe par matinale
    by_matinale: dict[int, dict] = {}
    for r in rows:
        mid = r["matinale_id"]
        if mid not in by_matinale:
            pub = r["published_at"]
            if pub.tzinfo is None:
                pub = pub.replace(tzinfo=timezone.utc)
            by_matinale[mid] = {
                "matinale_id":      mid,
                "channel":          r["channel"],
                "title":            r["title"],
                "youtube_video_id": r["youtube_video_id"],
                "published_at":     pub.isoformat(),
                "snapshots":        [],
            }
        snap_at = r["snapshot_at"]
        if snap_at.tzinfo is None:
            snap_at = snap_at.replace(tzinfo=timezone.utc)
        by_matinale[mid]["snapshots"].append({
            "time":          snap_at.strftime("%H:%M"),
            "snapshot_at":   snap_at.isoformat(),
            "view_count":    r["view_count"],
            "like_count":    r["like_count"],
            "comment_count": r["comment_count"],
        })

    return list(by_matinale.values())


@router.get("/timeline")
def get_timeline(days: int = Query(60, ge=1, le=730)):
    since = _since(days)
    rows = query("""
        SELECT
            DATE(m.published_at) AS date,
            c.name AS channel,
            COALESCE(SUM(vs.view_count), 0) AS views
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        LEFT JOIN view_snapshots vs ON vs.id = (
            SELECT id FROM view_snapshots
            WHERE matinale_id = m.id
            ORDER BY snapshot_at DESC LIMIT 1
        )
        WHERE m.published_at >= %s
        GROUP BY DATE(m.published_at), c.name
        ORDER BY date ASC
    """, (since,))

    by_date: dict[str, dict] = defaultdict(dict)
    for r in rows:
        by_date[str(r["date"])][r["channel"]] = int(r["views"])

    return [{"date": d, **data} for d, data in sorted(by_date.items())]
