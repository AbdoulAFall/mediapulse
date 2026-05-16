"""
Routes d'administration MediaPulse.

Authentification : header X-Admin-Token = variable d'env ADMIN_TOKEN.
Endpoint public (sans auth) : POST /api/matinales/{id}/report
"""
import os
import re
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from database import query, execute

router = APIRouter(prefix="/api", tags=["admin"])

ADMIN_TOKEN = os.environ.get("ADMIN_TOKEN", "")
YT_KEY      = os.environ.get("YOUTUBE_API_KEY", "")
YT_BASE     = "https://www.googleapis.com/youtube/v3"


# ── Auth ──────────────────────────────────────────────────────────────────────

def require_admin(token: str):
    if not ADMIN_TOKEN:
        raise HTTPException(status_code=503, detail="ADMIN_TOKEN non configuré côté serveur.")
    if token != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Token admin invalide.")


# ── Pydantic models ───────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    reason: str
    comment: Optional[str] = None

class ReportPatch(BaseModel):
    status: str  # resolved | ignored

class ExcludedDayCreate(BaseModel):
    date: str            # YYYY-MM-DD
    reason: Optional[str] = None

class MatinaleAdd(BaseModel):
    channel_id: int
    youtube_url: str

class MatinaleReplace(BaseModel):
    youtube_url: str

class AdminLogin(BaseModel):
    password: str


# ── YouTube helpers ───────────────────────────────────────────────────────────

def _extract_video_id(url_or_id: str) -> str:
    for pattern in [r"(?:v=|youtu\.be/|/embed/|/shorts/)([A-Za-z0-9_-]{11})"]:
        m = re.search(pattern, url_or_id)
        if m:
            return m.group(1)
    if re.match(r"^[A-Za-z0-9_-]{11}$", url_or_id):
        return url_or_id
    raise HTTPException(status_code=400, detail="URL ou ID YouTube invalide.")


def _fetch_yt_metadata(video_id: str) -> dict:
    if not YT_KEY:
        raise HTTPException(status_code=503, detail="YOUTUBE_API_KEY non configurée.")
    r = requests.get(f"{YT_BASE}/videos", params={
        "id": video_id,
        "part": "snippet,contentDetails,liveStreamingDetails",
        "key": YT_KEY,
    }, timeout=10)
    r.raise_for_status()
    items = r.json().get("items", [])
    if not items:
        raise HTTPException(status_code=404, detail=f"Vidéo {video_id} introuvable sur YouTube.")

    v    = items[0]
    sn   = v["snippet"]
    live = v.get("liveStreamingDetails", {})
    cd   = v.get("contentDetails", {})

    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", cd.get("duration", "") or "")
    duration = None
    if m:
        h, mn, s = (int(x or 0) for x in m.groups())
        duration = h * 3600 + mn * 60 + s

    published_at = (
        live.get("actualStartTime")
        or live.get("scheduledStartTime")
        or sn.get("publishedAt")
    )
    return {
        "youtube_video_id": video_id,
        "title":            sn.get("title"),
        "published_at":     published_at,
        "duration_seconds": duration,
    }


# ── Public : Signalement ──────────────────────────────────────────────────────

@router.post("/matinales/{matinale_id}/report", status_code=201)
def create_report(matinale_id: int, body: ReportCreate):
    """Signalement utilisateur — aucune authentification requise."""
    if not query("SELECT id FROM matinales WHERE id = %s", (matinale_id,)):
        raise HTTPException(status_code=404, detail="Matinale introuvable.")
    execute(
        "INSERT INTO reports (matinale_id, reason, comment) VALUES (%s, %s, %s)",
        (matinale_id, body.reason, body.comment),
    )
    return {"ok": True}


# ── Admin : Login ─────────────────────────────────────────────────────────────

@router.post("/admin/login")
def admin_login(body: AdminLogin):
    if not ADMIN_TOKEN or body.password != ADMIN_TOKEN:
        raise HTTPException(status_code=403, detail="Mot de passe incorrect.")
    return {"token": ADMIN_TOKEN}


# ── Admin : Signalements ──────────────────────────────────────────────────────

@router.get("/admin/reports")
def list_reports(
    status: str = Query("pending", pattern="^(pending|resolved|ignored)$"),
    x_admin_token: str = Header(default=""),
):
    require_admin(x_admin_token)
    return query("""
        SELECT
            r.id, r.reason, r.comment, r.status, r.created_at, r.resolved_at,
            m.id AS matinale_id, m.title, m.youtube_video_id,
            m.published_at, c.name AS channel
        FROM reports r
        JOIN matinales m ON m.id = r.matinale_id
        JOIN channels  c ON c.id = m.channel_id
        WHERE r.status = %s
        ORDER BY r.created_at DESC
    """, (status,))


@router.patch("/admin/reports/{report_id}")
def update_report(
    report_id: int,
    body: ReportPatch,
    x_admin_token: str = Header(default=""),
):
    require_admin(x_admin_token)
    if body.status not in ("resolved", "ignored"):
        raise HTTPException(status_code=400, detail="Status invalide (resolved | ignored).")
    execute(
        "UPDATE reports SET status = %s, resolved_at = NOW() WHERE id = %s",
        (body.status, report_id),
    )
    return {"ok": True}


# ── Admin : Matinales ─────────────────────────────────────────────────────────

@router.get("/admin/matinales")
def list_admin_matinales(
    days: int = Query(30, ge=1, le=730),
    x_admin_token: str = Header(default=""),
):
    require_admin(x_admin_token)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return query("""
        SELECT
            m.id, m.youtube_video_id, m.title, m.published_at, m.duration_seconds,
            c.name AS channel, c.id AS channel_db_id,
            (SELECT COUNT(*) FROM reports
             WHERE matinale_id = m.id AND status = 'pending') AS pending_reports
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        WHERE m.published_at >= %s
        ORDER BY m.published_at DESC
    """, (since,))


@router.delete("/admin/matinales/{matinale_id}", status_code=204)
def delete_matinale(matinale_id: int, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    if not query("SELECT id FROM matinales WHERE id = %s", (matinale_id,)):
        raise HTTPException(status_code=404, detail="Matinale introuvable.")
    execute("DELETE FROM matinales WHERE id = %s", (matinale_id,))


@router.patch("/admin/matinales/{matinale_id}")
def replace_matinale(
    matinale_id: int,
    body: MatinaleReplace,
    x_admin_token: str = Header(default=""),
):
    require_admin(x_admin_token)
    if not query("SELECT id FROM matinales WHERE id = %s", (matinale_id,)):
        raise HTTPException(status_code=404, detail="Matinale introuvable.")

    video_id = _extract_video_id(body.youtube_url)
    # Vérifie que l'id n'est pas déjà en base (autre matinale)
    existing = query(
        "SELECT id FROM matinales WHERE youtube_video_id = %s AND id != %s",
        (video_id, matinale_id),
    )
    if existing:
        raise HTTPException(status_code=409, detail="Cette vidéo est déjà assignée à une autre matinale.")

    meta = _fetch_yt_metadata(video_id)
    execute("""
        UPDATE matinales
        SET youtube_video_id = %s, title = %s, published_at = %s, duration_seconds = %s
        WHERE id = %s
    """, (meta["youtube_video_id"], meta["title"], meta["published_at"], meta["duration_seconds"], matinale_id))
    return {"ok": True, "video": meta}


@router.post("/admin/matinales", status_code=201)
def add_matinale(body: MatinaleAdd, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    if not query("SELECT id FROM channels WHERE id = %s", (body.channel_id,)):
        raise HTTPException(status_code=404, detail="Chaîne introuvable.")

    video_id = _extract_video_id(body.youtube_url)
    if query("SELECT id FROM matinales WHERE youtube_video_id = %s", (video_id,)):
        raise HTTPException(status_code=409, detail="Cette vidéo est déjà en base.")

    meta = _fetch_yt_metadata(video_id)
    execute("""
        INSERT INTO matinales (channel_id, youtube_video_id, title, published_at, duration_seconds)
        VALUES (%s, %s, %s, %s, %s)
    """, (body.channel_id, meta["youtube_video_id"], meta["title"], meta["published_at"], meta["duration_seconds"]))
    return {"ok": True, "video": meta}


# ── Admin : Jours exclus ──────────────────────────────────────────────────────

@router.get("/admin/excluded-days")
def list_excluded_days(x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    return query("SELECT id, date, reason, created_at FROM excluded_days ORDER BY date DESC")


@router.post("/admin/excluded-days", status_code=201)
def add_excluded_day(body: ExcludedDayCreate, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format invalide — utiliser YYYY-MM-DD.")
    try:
        execute(
            "INSERT INTO excluded_days (date, reason) VALUES (%s, %s)",
            (body.date, body.reason),
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Ce jour est déjà exclu.")
    return {"ok": True}


@router.delete("/admin/excluded-days/{day_id}", status_code=204)
def delete_excluded_day(day_id: int, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    execute("DELETE FROM excluded_days WHERE id = %s", (day_id,))
