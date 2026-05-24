"""
Routes d'administration MediaPulse.

Authentification : header X-Admin-Token = variable d'env ADMIN_TOKEN.
Endpoint public (sans auth) : POST /api/matinales/{id}/report
"""
import os
import re
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Header, Query
from pydantic import BaseModel

from database import query, execute
from refresh import do_refresh_today, do_refresh_smart, do_refresh_missing, do_refresh_missing_durations

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
    date:             str             # YYYY-MM-DD
    reason:           Optional[str] = None
    skip_collection:  bool = True     # False = fête info uniquement (tooltip), collecte maintenue

class MatinaleAdd(BaseModel):
    channel_id: int
    youtube_url: str

class MatinaleReplace(BaseModel):
    youtube_url: str

class AdminLogin(BaseModel):
    password: str

class SubscriberCreate(BaseModel):
    email: str
    name: Optional[str] = None

class ChannelCreate(BaseModel):
    name:           str                    # Nom affiché (ex: "TFM")
    handle:         str                    # @handle ou URL YouTube complète
    matinale_start: Optional[str] = "07:00"  # heure UTC début fenêtre
    matinale_end:   Optional[str] = "11:00"  # heure UTC fin fenêtre
    title_hints:    Optional[list] = []    # mots-clés titre (peut être vide)

class ChannelUpdate(BaseModel):
    name:           Optional[str] = None
    matinale_start: Optional[str] = None
    matinale_end:   Optional[str] = None
    title_hints:    Optional[list] = None


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
    """Fetche métadonnées + stats YouTube en un seul appel."""
    if not YT_KEY:
        raise HTTPException(status_code=503, detail="YOUTUBE_API_KEY non configurée.")
    r = requests.get(f"{YT_BASE}/videos", params={
        "id": video_id,
        "part": "snippet,contentDetails,liveStreamingDetails,statistics",
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
    stats = v.get("statistics", {})

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
        # Stats actuelles (pour snapshot immédiat)
        "view_count":    int(stats.get("viewCount",    0) or 0),
        "like_count":    int(stats.get("likeCount",    0) or 0),
        "comment_count": int(stats.get("commentCount", 0) or 0),
    }


def _insert_snapshot(matinale_id: int, meta: dict):
    """Insère un snapshot de vues immédiatement après add/replace."""
    execute("""
        INSERT INTO view_snapshots (matinale_id, view_count, like_count, comment_count)
        VALUES (%s, %s, %s, %s)
    """, (matinale_id, meta.get("view_count"), meta.get("like_count"), meta.get("comment_count")))


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
    # Supprime d'abord les snapshots (FK sans CASCADE) puis la matinale
    execute("DELETE FROM view_snapshots WHERE matinale_id = %s", (matinale_id,))
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
    # Snapshot immédiat avec les stats actuelles
    _insert_snapshot(matinale_id, meta)
    return {"ok": True, "video": meta}


@router.post("/admin/matinales", status_code=201)
def add_matinale(body: MatinaleAdd, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    if not query("SELECT id FROM channels WHERE id = %s", (body.channel_id,)):
        raise HTTPException(status_code=404, detail="Chaîne introuvable.")

    video_id = _extract_video_id(body.youtube_url)
    meta     = _fetch_yt_metadata(video_id)

    # Vérifie si cette vidéo exacte est déjà assignée ailleurs
    same_vid = query(
        "SELECT id FROM matinales WHERE youtube_video_id = %s",
        (video_id,),
    )
    if same_vid:
        raise HTTPException(status_code=409, detail="Cette vidéo est déjà en base.")

    # Si une matinale existe déjà pour cette chaîne ce jour-là → on la remplace
    if meta.get("published_at"):
        existing = query("""
            SELECT id FROM matinales
            WHERE channel_id = %s
              AND DATE(published_at AT TIME ZONE 'UTC')
                  = DATE(%s::timestamptz AT TIME ZONE 'UTC')
        """, (body.channel_id, meta["published_at"]))
        if existing:
            # Supprime l'ancienne (cascade supprime aussi les snapshots)
            execute("DELETE FROM matinales WHERE id = %s", (existing[0]["id"],))

    execute("""
        INSERT INTO matinales (channel_id, youtube_video_id, title, published_at, duration_seconds)
        VALUES (%s, %s, %s, %s, %s)
    """, (body.channel_id, meta["youtube_video_id"], meta["title"], meta["published_at"], meta["duration_seconds"]))
    # Récupère l'id de la matinale insérée pour le snapshot
    new_row = query(
        "SELECT id FROM matinales WHERE youtube_video_id = %s",
        (meta["youtube_video_id"],),
    )
    if new_row:
        _insert_snapshot(new_row[0]["id"], meta)
    replaced = bool(existing) if meta.get("published_at") else False
    return {"ok": True, "video": meta, "replaced": replaced}


# ── Admin : Jours exclus ──────────────────────────────────────────────────────

@router.get("/admin/excluded-days")
def list_excluded_days(x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    # Migration idempotente
    try:
        execute("ALTER TABLE excluded_days ADD COLUMN IF NOT EXISTS skip_collection BOOLEAN DEFAULT true")
    except Exception:
        pass
    return query("""
        SELECT id, date, reason,
               COALESCE(skip_collection, true) AS skip_collection,
               created_at
        FROM excluded_days
        ORDER BY date DESC
    """)


@router.post("/admin/excluded-days", status_code=201)
def add_excluded_day(body: ExcludedDayCreate, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    try:
        datetime.strptime(body.date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Format invalide — utiliser YYYY-MM-DD.")
    try:
        execute("ALTER TABLE excluded_days ADD COLUMN IF NOT EXISTS skip_collection BOOLEAN DEFAULT true")
    except Exception:
        pass
    try:
        execute(
            "INSERT INTO excluded_days (date, reason, skip_collection) VALUES (%s, %s, %s)",
            (body.date, body.reason, body.skip_collection),
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Ce jour est déjà enregistré.")
    return {"ok": True}


@router.delete("/admin/excluded-days/{day_id}", status_code=204)
def delete_excluded_day(day_id: int, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    execute("DELETE FROM excluded_days WHERE id = %s", (day_id,))


# ── Admin : Abonnés rapport email ─────────────────────────────────────────────

@router.get("/admin/subscribers")
def list_subscribers(x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    return query("""
        SELECT id, email, name, active, created_at
        FROM subscribers
        ORDER BY created_at DESC
    """)


@router.post("/admin/subscribers", status_code=201)
def add_subscriber(body: SubscriberCreate, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    email = body.email.strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Adresse email invalide.")
    try:
        execute(
            "INSERT INTO subscribers (email, name) VALUES (%s, %s)",
            (email, body.name),
        )
    except Exception:
        raise HTTPException(status_code=409, detail="Cet email est déjà abonné.")
    return {"ok": True}


@router.patch("/admin/subscribers/{sub_id}")
def toggle_subscriber(sub_id: int, x_admin_token: str = Header(default="")):
    """Active / désactive un abonné."""
    require_admin(x_admin_token)
    rows = query("SELECT active FROM subscribers WHERE id = %s", (sub_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Abonné introuvable.")
    new_state = not rows[0]["active"]
    execute("UPDATE subscribers SET active = %s WHERE id = %s", (new_state, sub_id))
    return {"ok": True, "active": new_state}


@router.delete("/admin/subscribers/{sub_id}", status_code=204)
def delete_subscriber(sub_id: int, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    execute("DELETE FROM subscribers WHERE id = %s", (sub_id,))


# ── Admin : Envoi manuel du rapport email ─────────────────────────────────────

RESEND_API_KEY  = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL      = os.environ.get("REPORT_FROM_EMAIL", "MediaPulse <onboarding@resend.dev>")
DASHBOARD_URL   = os.environ.get("DASHBOARD_URL", "https://mediapulse.vercel.app")
GITHUB_TOKEN    = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO     = os.environ.get("GITHUB_REPO", "AbdoulAFall/mediapulse")

CHANNEL_COLORS = {
    "TFM": "#d0021b", "RTS": "#1a1714", "2STV": "#c0392b",
    "Sen TV": "#4a4440", "Walf TV": "#7a736a", "Solution TV": "#8b0000",
}

def _fmt_views(n) -> str:
    if n is None: return "—"
    n = int(n)
    if n >= 1_000_000: return f"{n/1_000_000:.1f}M"
    if n >= 1_000:     return f"{n/1_000:.0f}k"
    return str(n)

def _fmt_dur(s) -> str:
    if not s: return "—"
    h, r = divmod(int(s), 3600); m, _ = divmod(r, 60)
    return f"{h}h{m:02d}" if h else f"{m} min"

def _build_report_html(rows: list, date_str: str) -> str:
    sorted_rows = sorted(rows, key=lambda r: r.get("view_count") or 0, reverse=True)
    total = sum((r.get("view_count") or 0) for r in sorted_rows)
    medals = {1: "🥇", 2: "🥈", 3: "🥉"}

    rows_html = ""
    for rank, r in enumerate(sorted_rows, 1):
        ch     = r.get("channel_name", "?")
        color  = CHANNEL_COLORS.get(ch, "#333")
        views  = r.get("view_count")
        first  = r.get("view_count_first")
        delta  = (int(views) - int(first)) if (views and first) else None
        share  = f"{int(views)/total*100:.0f}%" if (views and total) else "—"
        pub_time = ""
        if r.get("published_at"):
            dt = r["published_at"]
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
            pub_time = dt.strftime("%H:%M UTC")
        delta_html = ""
        if delta is not None:
            sign  = "+" if delta >= 0 else ""
            dcol  = "#2e7d32" if delta >= 0 else "#c62828"
            delta_html = f'<span style="color:{dcol};font-size:12px;">{sign}{_fmt_views(delta)} depuis le matin</span>'
        rows_html += f"""
        <tr>
          <td style="padding:12px 14px;border-bottom:1px solid #e8e5e1;font-family:Arial,sans-serif;font-size:13px;color:#7a736a;">{medals.get(rank, f'#{rank}')}</td>
          <td style="padding:12px 14px;border-bottom:1px solid #e8e5e1;">
            <span style="display:inline-block;width:3px;height:14px;background:{color};margin-right:8px;vertical-align:middle;"></span>
            <strong style="font-family:Arial,sans-serif;font-size:14px;color:#1a1714;">{ch}</strong>
            <br><span style="font-family:Arial,sans-serif;font-size:11px;color:#aaa;">{pub_time} · {_fmt_dur(r.get('duration_seconds'))}</span>
          </td>
          <td style="padding:12px 14px;border-bottom:1px solid #e8e5e1;text-align:right;">
            <strong style="font-family:Georgia,serif;font-size:20px;color:#1a1714;">{_fmt_views(views)}</strong>
            <span style="font-family:Arial,sans-serif;font-size:11px;color:#aaa;display:block;">{share}</span>
          </td>
          <td style="padding:12px 14px;border-bottom:1px solid #e8e5e1;font-size:12px;color:#555;">{delta_html or '<span style="color:#ccc;">—</span>'}</td>
          <td style="padding:12px 14px;border-bottom:1px solid #e8e5e1;text-align:center;">
            <a href="https://www.youtube.com/watch?v={r.get('youtube_video_id','')}" style="font-family:Arial,sans-serif;font-size:11px;color:#d0021b;text-decoration:none;border:1px solid #d0021b;padding:3px 8px;">▶ YouTube</a>
          </td>
        </tr>"""

    return f"""<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8">
<title>MediaPulse · {date_str}</title></head>
<body style="margin:0;padding:0;background:#f0ede8;">
<div style="max-width:620px;margin:24px auto;background:#fff;box-shadow:0 2px 12px rgba(0,0,0,0.08);">
  <div style="background:#d0021b;height:4px;"></div>
  <div style="background:#1a1714;padding:22px 28px 18px;">
    <h1 style="margin:0;font-family:Georgia,serif;font-size:26px;color:#fff;">MEDIAPULSE</h1>
    <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:11px;color:#aaa;letter-spacing:2px;text-transform:uppercase;">Rapport vues · {date_str}</p>
  </div>
  <div style="background:#f5f3f1;padding:18px 28px;border-bottom:1px solid #e0ddd9;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;">Total vues · {len(sorted_rows)} matinale(s)</p>
    <p style="margin:4px 0 0;font-family:Georgia,serif;font-size:32px;font-weight:bold;color:#1a1714;">{_fmt_views(total)}</p>
  </div>
  <div style="padding:20px 28px;">
    <table style="width:100%;border-collapse:collapse;">
      <thead><tr style="border-bottom:2px solid #1a1714;">
        <th style="padding:8px 14px;font-family:Arial,sans-serif;font-size:10px;color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;text-align:left;">#</th>
        <th style="padding:8px 14px;font-family:Arial,sans-serif;font-size:10px;color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;text-align:left;">Chaîne</th>
        <th style="padding:8px 14px;font-family:Arial,sans-serif;font-size:10px;color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;text-align:right;">Vues</th>
        <th style="padding:8px 14px;font-family:Arial,sans-serif;font-size:10px;color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;">Progression</th>
        <th style="padding:8px 14px;font-family:Arial,sans-serif;font-size:10px;color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;text-align:center;">Lien</th>
      </tr></thead>
      <tbody>{rows_html}</tbody>
    </table>
  </div>
  <div style="padding:14px 28px;border-top:1px solid #e0ddd9;background:#f5f3f1;">
    <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#aaa;">
      <a href="{DASHBOARD_URL}/timeline" style="color:#d0021b;text-decoration:none;">Voir l'évolution →</a> &nbsp;·&nbsp;
      <a href="{DASHBOARD_URL}" style="color:#7a736a;text-decoration:none;">Dashboard</a> &nbsp;·&nbsp;
      Envoyé le {datetime.now(timezone.utc).strftime("%d/%m/%Y à %H:%M UTC")}
    </p>
  </div>
  <div style="background:#d0021b;height:3px;"></div>
</div></body></html>"""


class ReportSendBody(BaseModel):
    date: Optional[str] = None   # YYYY-MM-DD, défaut = aujourd'hui

class DetectBody(BaseModel):
    date: str                    # YYYY-MM-DD : jour cible à (re)détecter
    channel: Optional[str] = None  # filtre chaîne (ex: "TFM"), vide = toutes


@router.post("/admin/report/send")
def send_report_now(body: ReportSendBody = ReportSendBody(), x_admin_token: str = Header(default="")):
    """Envoie le rapport des vues pour une date donnée (défaut : aujourd'hui)."""
    require_admin(x_admin_token)

    if not RESEND_API_KEY:
        raise HTTPException(status_code=503, detail="RESEND_API_KEY non configurée.")

    # Valide et parse la date
    if body.date:
        try:
            report_date = datetime.strptime(body.date, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=400, detail="Format de date invalide — utiliser YYYY-MM-DD.")
    else:
        report_date = datetime.now(timezone.utc).date()

    # Récupère les abonnés actifs
    subs = query("SELECT email FROM subscribers WHERE active = true")
    if not subs:
        raise HTTPException(status_code=400, detail="Aucun abonné actif à qui envoyer le rapport.")

    # Récupère les matinales de la date choisie avec leurs vues
    rows = query("""
        SELECT
            c.name AS channel_name,
            m.title, m.youtube_video_id, m.published_at, m.duration_seconds,
            last_vs.view_count, last_vs.like_count, last_vs.snapshot_at,
            first_vs.view_count AS view_count_first
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        LEFT JOIN view_snapshots last_vs ON last_vs.id = (
            SELECT id FROM view_snapshots WHERE matinale_id = m.id ORDER BY snapshot_at DESC LIMIT 1
        )
        LEFT JOIN view_snapshots first_vs ON first_vs.id = (
            SELECT id FROM view_snapshots WHERE matinale_id = m.id ORDER BY snapshot_at ASC LIMIT 1
        )
        WHERE DATE(m.published_at AT TIME ZONE 'UTC') = %s
        ORDER BY last_vs.view_count DESC NULLS LAST
    """, (str(report_date),))

    if not rows:
        raise HTTPException(status_code=404, detail=f"Aucune matinale trouvée pour le {report_date}.")

    fr_days   = ["lundi","mardi","mercredi","jeudi","vendredi","samedi","dimanche"]
    fr_months = ["","janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"]
    date_str  = f"{fr_days[report_date.weekday()]} {report_date.day} {fr_months[report_date.month]} {report_date.year}"

    html    = _build_report_html(rows, date_str)
    to_list = [s["email"] for s in subs]

    resp = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {RESEND_API_KEY}", "Content-Type": "application/json"},
        data=json.dumps({
            "from":    FROM_EMAIL,
            "to":      to_list,
            "subject": f"📺 MediaPulse · Vues matinales du {date_str}",
            "html":    html,
        }),
        timeout=15,
    )

    if resp.status_code not in (200, 201):
        raise HTTPException(status_code=502, detail=f"Erreur Resend : {resp.text}")

    return {
        "ok":         True,
        "recipients": to_list,
        "matinales":  len(rows),
        "resend_id":  resp.json().get("id"),
    }


# ── Admin : Refresh manuel (test) ────────────────────────────────────────────

@router.post("/admin/refresh-missing")
def refresh_missing_snapshots(x_admin_token: str = Header(default="")):
    """
    Insère un snapshot pour toutes les matinales sans aucune vue enregistrée.
    Utile après un backfill ou l'ajout d'une nouvelle chaîne (ex : Eric Favre TV).
    Aucune limite de date — cible uniquement les vidéos avec 0 snapshot.
    """
    require_admin(x_admin_token)
    count = do_refresh_missing()
    return {
        "inserted": count,
        "message": (
            f"{count} snapshot(s) insérés pour les matinales sans vues."
            if count else
            "Toutes les matinales ont déjà au moins un snapshot."
        ),
    }


@router.post("/admin/refresh-durations")
def refresh_missing_durations(x_admin_token: str = Header(default="")):
    """
    Récupère la durée réelle pour les matinales avec duration_seconds NULL.
    Typiquement : vidéos détectées en live (durée P0D), puis terminées.
    """
    require_admin(x_admin_token)
    count = do_refresh_missing_durations()
    return {
        "updated": count,
        "message": (
            f"{count} durée(s) mise(s) à jour."
            if count else
            "Aucune durée manquante — ou les lives sont encore en cours."
        ),
    }


@router.post("/admin/refresh-now")
def refresh_now(x_admin_token: str = Header(default="")):
    """
    Déclenche un refresh immédiat des vues (bypass plage horaire + week-end).
    Utile pour tester le système sans attendre lun–ven 5h–14h UTC.
    """
    require_admin(x_admin_token)

    import concurrent.futures
    results = {}

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as ex:
        f_today = ex.submit(do_refresh_today, True)   # force=True
        f_smart = ex.submit(do_refresh_smart, True)
        results["refresh_today"] = f_today.result()
        results["refresh_smart"] = f_smart.result()

    total = results["refresh_today"] + results["refresh_smart"]
    results["total_snapshots"] = total
    results["message"] = (
        f"{total} snapshot(s) insérés."
        if total else
        "Aucun snapshot inséré — soit aucune matinale aujourd'hui, soit les vues ont été rafraîchies récemment (< 15 min)."
    )
    return results


# ── Admin : Chaînes ───────────────────────────────────────────────────────────

def _resolve_channel(handle_or_url: str) -> dict:
    """
    Résout un handle YouTube (@xxx), une URL complète ou un channel_id (UCxxx)
    en retournant { channel_id, playlist_id, channel_name }.
    La clé `channel_id` correspond à la colonne `channel_id` de la table channels.
    """
    if not YT_KEY:
        raise HTTPException(status_code=503, detail="YOUTUBE_API_KEY non configurée.")

    s = handle_or_url.strip()

    # Cas 1 : URL /channel/UCxxx
    m = re.search(r"/channel/(UC[A-Za-z0-9_-]+)", s)
    if m:
        cid = m.group(1)
        return {"channel_id": cid, "playlist_id": "UU" + cid[2:], "channel_name": None}

    # Cas 2 : raw channel_id UCxxx
    if re.match(r"^UC[A-Za-z0-9_-]{22}$", s):
        return {"channel_id": s, "playlist_id": "UU" + s[2:], "channel_name": None}

    # Cas 3 : @handle (dans URL ou brut)
    m = re.search(r"@([A-Za-z0-9_.-]+)", s)
    handle_clean = ("@" + m.group(1)) if m else ("@" + s.lstrip("@"))

    r = requests.get(f"{YT_BASE}/channels", params={
        "part":      "id,snippet",
        "forHandle": handle_clean,
        "key":       YT_KEY,
    }, timeout=10)
    r.raise_for_status()
    items = r.json().get("items", [])
    if not items:
        raise HTTPException(status_code=404, detail=f"Chaîne introuvable pour {handle_clean}. Vérifie le handle ou utilise l'URL complète.")

    cid  = items[0]["id"]
    name = items[0]["snippet"].get("title")
    return {"channel_id": cid, "playlist_id": "UU" + cid[2:], "channel_name": name, "handle": handle_clean}


@router.get("/admin/channels")
def list_channels_admin(x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    # Migrations idempotentes — s'exécutent côté API au premier appel
    for col_sql in [
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS handle         TEXT",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS matinale_start TEXT DEFAULT '07:00'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS matinale_end   TEXT DEFAULT '11:00'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS title_hints    TEXT DEFAULT '[]'",
    ]:
        try:
            execute(col_sql)
        except Exception:
            pass
    return query("""
        SELECT id, name, handle, channel_id, playlist_id, active, resolved_at,
               COALESCE(matinale_start, '07:00') AS matinale_start,
               COALESCE(matinale_end,   '11:00') AS matinale_end,
               COALESCE(title_hints,    '[]')    AS title_hints,
               (SELECT COUNT(*) FROM matinales WHERE channel_id = channels.id) AS matinale_count
        FROM channels
        ORDER BY id
    """)


@router.post("/admin/channels", status_code=201)
def add_channel(body: ChannelCreate, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)

    # Migrations idempotentes
    for col_sql in [
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS handle         TEXT",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS matinale_start TEXT DEFAULT '07:00'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS matinale_end   TEXT DEFAULT '11:00'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS title_hints    TEXT DEFAULT '[]'",
    ]:
        try:
            execute(col_sql)
        except Exception:
            pass

    resolved    = _resolve_channel(body.handle)
    yt_cid      = resolved["channel_id"]   # valeur de la colonne channel_id en base
    playlist_id = resolved["playlist_id"]
    handle      = resolved.get("handle") or body.handle.strip()

    existing = query("SELECT id FROM channels WHERE channel_id = %s", (yt_cid,))
    if existing:
        raise HTTPException(status_code=409, detail=f"Cette chaîne est déjà en base (id={existing[0]['id']}).")

    import json as _json
    execute(
        """INSERT INTO channels (name, handle, channel_id, playlist_id, active,
                                 matinale_start, matinale_end, title_hints)
           VALUES (%s, %s, %s, %s, 1, %s, %s, %s)""",
        (body.name.strip(), handle, yt_cid, playlist_id,
         body.matinale_start or "07:00",
         body.matinale_end   or "11:00",
         _json.dumps(body.title_hints or [])),
    )
    new_row = query("SELECT id FROM channels WHERE channel_id = %s", (yt_cid,))
    return {
        "ok":            True,
        "id":            new_row[0]["id"] if new_row else None,
        "channel_id":    yt_cid,
        "playlist_id":   playlist_id,
        "handle":        handle,
        "resolved_name": resolved.get("channel_name"),
    }


@router.put("/admin/channels/{channel_id}")
def update_channel(channel_id: int, body: ChannelUpdate, x_admin_token: str = Header(default="")):
    """Met à jour la configuration d'une chaîne (fenêtre horaire, hints, nom)."""
    require_admin(x_admin_token)
    import json as _json
    for col_sql in [
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS matinale_start TEXT DEFAULT '07:00'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS matinale_end   TEXT DEFAULT '11:00'",
        "ALTER TABLE channels ADD COLUMN IF NOT EXISTS title_hints    TEXT DEFAULT '[]'",
    ]:
        try:
            execute(col_sql)
        except Exception:
            pass
    if not query("SELECT id FROM channels WHERE id = %s", (channel_id,)):
        raise HTTPException(status_code=404, detail="Chaîne introuvable.")

    fields, values = [], []
    if body.name is not None:
        fields.append("name = %s"); values.append(body.name.strip())
    if body.matinale_start is not None:
        fields.append("matinale_start = %s"); values.append(body.matinale_start)
    if body.matinale_end is not None:
        fields.append("matinale_end = %s"); values.append(body.matinale_end)
    if body.title_hints is not None:
        fields.append("title_hints = %s"); values.append(_json.dumps(body.title_hints))

    if not fields:
        return {"ok": True, "message": "Aucun champ modifié."}

    values.append(channel_id)
    execute(f"UPDATE channels SET {', '.join(fields)} WHERE id = %s", values)
    return {"ok": True}


@router.patch("/admin/channels/{channel_id}")
def toggle_channel(channel_id: int, x_admin_token: str = Header(default="")):
    """Active ou désactive une chaîne (toggle)."""
    require_admin(x_admin_token)
    rows = query("SELECT active FROM channels WHERE id = %s", (channel_id,))
    if not rows:
        raise HTTPException(status_code=404, detail="Chaîne introuvable.")
    new_state = 0 if rows[0]["active"] else 1
    execute("UPDATE channels SET active = %s WHERE id = %s", (new_state, channel_id))
    return {"ok": True, "active": bool(new_state)}


@router.delete("/admin/channels/{channel_id}", status_code=204)
def delete_channel(channel_id: int, x_admin_token: str = Header(default="")):
    require_admin(x_admin_token)
    cnt = query("SELECT COUNT(*) AS cnt FROM matinales WHERE channel_id = %s", (channel_id,))
    if cnt and int(cnt[0]["cnt"]) > 0:
        raise HTTPException(
            status_code=409,
            detail=f"Impossible de supprimer : {cnt[0]['cnt']} matinale(s) liée(s). Désactivez la chaîne à la place.",
        )
    execute("DELETE FROM channels WHERE id = %s", (channel_id,))


# ── Admin : Déclenchement détection via GitHub Actions ────────────────────────

@router.post("/admin/detect")
def trigger_detect(body: DetectBody, x_admin_token: str = Header(default="")):
    """
    Déclenche le workflow GitHub Actions detect.yml pour une date spécifique.
    Calcule automatiquement le paramètre `days` depuis aujourd'hui.
    Nécessite : GITHUB_TOKEN (PAT avec scope workflow) + GITHUB_REPO en variables Railway.
    """
    require_admin(x_admin_token)

    if not GITHUB_TOKEN:
        raise HTTPException(status_code=503, detail="GITHUB_TOKEN non configuré côté serveur.")

    # Valide la date cible
    try:
        target_date = datetime.strptime(body.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Format de date invalide — utiliser YYYY-MM-DD.")

    today = datetime.now(timezone.utc).date()
    if target_date > today:
        raise HTTPException(status_code=400, detail="La date cible ne peut pas être dans le futur.")

    delta = (today - target_date).days + 1  # +1 pour inclure le jour cible lui-même

    # Déclenche le workflow GitHub Actions detect.yml
    workflow_file = "detect.yml"
    url = f"https://api.github.com/repos/{GITHUB_REPO}/actions/workflows/{workflow_file}/dispatches"

    inputs: dict = {"days": str(delta)}
    if body.channel:
        inputs["channel"] = body.channel.strip()

    resp = requests.post(
        url,
        headers={
            "Authorization": f"Bearer {GITHUB_TOKEN}",
            "Accept":        "application/vnd.github+json",
            "Content-Type":  "application/json",
        },
        data=json.dumps({"ref": "main", "inputs": inputs}),
        timeout=15,
    )

    if resp.status_code == 204:
        return {
            "ok":      True,
            "date":    str(target_date),
            "days":    delta,
            "channel": body.channel or "toutes",
            "message": f"Détection lancée pour le {target_date} (fenêtre {delta}j).",
        }
    elif resp.status_code == 404:
        raise HTTPException(status_code=404, detail=f"Workflow '{workflow_file}' introuvable dans {GITHUB_REPO}.")
    elif resp.status_code == 422:
        raise HTTPException(status_code=422, detail="Workflow non activable (vérifier que la branche 'main' existe et que le PAT a le scope 'workflow').")
    else:
        raise HTTPException(status_code=502, detail=f"Erreur GitHub API {resp.status_code} : {resp.text[:300]}")
