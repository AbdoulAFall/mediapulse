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
