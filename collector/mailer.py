"""
Envoi d'emails via l'API Resend (HTTP direct, sans SDK).

Usage :
    from mailer import send_daily_report
    send_daily_report(rows, date_str, recipients=["toi@example.com"])
"""
import os
import json
import requests
from datetime import datetime, timezone

RESEND_API_KEY  = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL      = os.environ.get("REPORT_FROM_EMAIL", "MediaPulse <rapports@mediapulse.sn>")
REPORT_EMAILS   = os.environ.get("REPORT_EMAILS", "")          # séparés par virgule
DASHBOARD_URL   = os.environ.get("DASHBOARD_URL", "https://mediapulse.vercel.app")

CHANNEL_COLORS = {
    "TFM":         "#d0021b",
    "RTS":         "#1a1714",
    "2STV":        "#c0392b",
    "Sen TV":      "#4a4440",
    "Walf TV":     "#7a736a",
    "Solution TV": "#8b0000",
}
DEFAULT_COLOR = "#333333"


def _fmt(n) -> str:
    if n is None:
        return "—"
    n = int(n)
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.0f}k"
    return str(n)


def _fmt_duration(seconds) -> str:
    if not seconds:
        return "—"
    h, rem = divmod(int(seconds), 3600)
    m, _ = divmod(rem, 60)
    return f"{h}h{m:02d}" if h else f"{m} min"


def _rank_badge(rank: int) -> str:
    medals = {1: "🥇", 2: "🥈", 3: "🥉"}
    return medals.get(rank, f"#{rank}")


def build_html(rows: list, date_str: str) -> str:
    """Génère le HTML du rapport quotidien."""

    # Tri par vues décroissantes (déjà fait par la requête, mais sécurité)
    sorted_rows = sorted(rows, key=lambda r: r.get("view_count") or 0, reverse=True)
    total_views = sum((r.get("view_count") or 0) for r in sorted_rows)

    # ── En-tête ──────────────────────────────────────────────────────────────
    header = f"""
    <div style="background:#d0021b;height:4px;"></div>
    <div style="background:#1a1714;padding:24px 32px 20px;">
      <h1 style="margin:0;font-family:Georgia,serif;font-size:28px;
                 color:#ffffff;letter-spacing:-0.5px;">MEDIAPULSE</h1>
      <p style="margin:4px 0 0;font-family:Arial,sans-serif;font-size:11px;
                color:#aaaaaa;letter-spacing:2px;text-transform:uppercase;">
        Rapport vues · Matinales du {date_str}
      </p>
    </div>
    """

    # ── KPI global ───────────────────────────────────────────────────────────
    kpi = f"""
    <div style="background:#f5f3f1;padding:20px 32px;
                border-bottom:1px solid #e0ddd9;">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:12px;
                color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;">
        Total vues cumulées · {len(sorted_rows)} matinale(s)
      </p>
      <p style="margin:4px 0 0;font-family:Georgia,serif;font-size:36px;
                font-weight:bold;color:#1a1714;">
        {_fmt(total_views)}
      </p>
    </div>
    """

    # ── Tableau des chaînes ───────────────────────────────────────────────────
    rows_html = ""
    for rank, r in enumerate(sorted_rows, 1):
        channel  = r.get("channel_name", "?")
        color    = CHANNEL_COLORS.get(channel, DEFAULT_COLOR)
        views    = r.get("view_count")
        v_first  = r.get("view_count_first")
        delta    = (views - v_first) if (views and v_first) else None
        share    = f"{views / total_views * 100:.0f}%" if (views and total_views) else "—"
        pub_time = ""
        if r.get("published_at"):
            dt = r["published_at"]
            if isinstance(dt, str):
                dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
            pub_time = dt.strftime("%H:%M UTC")

        delta_html = ""
        if delta is not None:
            sign  = "+" if delta >= 0 else ""
            dcolor = "#2e7d32" if delta >= 0 else "#c62828"
            delta_html = (
                f'<span style="color:{dcolor};font-size:12px;margin-left:6px;">'
                f'{sign}{_fmt(delta)} depuis le matin</span>'
            )

        rows_html += f"""
        <tr>
          <td style="padding:14px 16px;border-bottom:1px solid #e8e5e1;
                     font-family:Arial,sans-serif;font-size:13px;
                     color:#7a736a;white-space:nowrap;">
            {_rank_badge(rank)}
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #e8e5e1;">
            <span style="display:inline-block;width:3px;height:16px;
                         background:{color};margin-right:10px;
                         vertical-align:middle;border-radius:1px;"></span>
            <strong style="font-family:Arial,sans-serif;font-size:14px;
                           color:#1a1714;">{channel}</strong>
            <br>
            <span style="font-family:Arial,sans-serif;font-size:11px;
                         color:#aaaaaa;">{pub_time} · {_fmt_duration(r.get('duration_seconds'))}</span>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #e8e5e1;
                     text-align:right;white-space:nowrap;">
            <strong style="font-family:Georgia,serif;font-size:20px;
                           color:#1a1714;">{_fmt(views)}</strong>
            <span style="font-family:Arial,sans-serif;font-size:11px;
                         color:#aaaaaa;display:block;">{share} du total</span>
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #e8e5e1;
                     font-family:Arial,sans-serif;font-size:12px;color:#555;">
            {delta_html if delta_html else '<span style="color:#ccc;">—</span>'}
          </td>
          <td style="padding:14px 16px;border-bottom:1px solid #e8e5e1;
                     text-align:center;">
            <a href="https://www.youtube.com/watch?v={r.get('youtube_video_id', '')}"
               style="font-family:Arial,sans-serif;font-size:11px;color:#d0021b;
                      text-decoration:none;border:1px solid #d0021b;
                      padding:3px 8px;border-radius:2px;">
              ▶ YouTube
            </a>
          </td>
        </tr>
        """

    table = f"""
    <div style="padding:24px 32px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="border-bottom:2px solid #1a1714;">
            <th style="padding:8px 16px;font-family:Arial,sans-serif;font-size:10px;
                       color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;
                       text-align:left;font-weight:600;">#</th>
            <th style="padding:8px 16px;font-family:Arial,sans-serif;font-size:10px;
                       color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;
                       text-align:left;font-weight:600;">Chaîne</th>
            <th style="padding:8px 16px;font-family:Arial,sans-serif;font-size:10px;
                       color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;
                       text-align:right;font-weight:600;">Vues</th>
            <th style="padding:8px 16px;font-family:Arial,sans-serif;font-size:10px;
                       color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;
                       text-align:left;font-weight:600;">Progression</th>
            <th style="padding:8px 16px;font-family:Arial,sans-serif;font-size:10px;
                       color:#7a736a;text-transform:uppercase;letter-spacing:1.5px;
                       text-align:center;font-weight:600;">Lien</th>
          </tr>
        </thead>
        <tbody>
          {rows_html}
        </tbody>
      </table>
    </div>
    """

    # ── Footer ────────────────────────────────────────────────────────────────
    footer = f"""
    <div style="padding:16px 32px;border-top:1px solid #e0ddd9;
                background:#f5f3f1;">
      <p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#aaaaaa;">
        <a href="{DASHBOARD_URL}/timeline"
           style="color:#d0021b;text-decoration:none;">Voir l'évolution →</a>
        &nbsp;·&nbsp;
        <a href="{DASHBOARD_URL}"
           style="color:#7a736a;text-decoration:none;">Dashboard MediaPulse</a>
        &nbsp;·&nbsp; Rapport généré automatiquement · {datetime.now(timezone.utc).strftime("%H:%M UTC")}
      </p>
    </div>
    <div style="background:#d0021b;height:3px;"></div>
    """

    return f"""<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MediaPulse · Rapport vues {date_str}</title></head>
<body style="margin:0;padding:0;background:#f0ede8;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;
              box-shadow:0 2px 12px rgba(0,0,0,0.08);">
    {header}
    {kpi}
    {table}
    {footer}
  </div>
</body>
</html>"""


def send_daily_report(rows: list, date_str: str,
                      recipients: list[str] | None = None) -> bool:
    """
    Envoie le rapport quotidien via Resend.

    Destinataires (par ordre de priorité) :
      1. `recipients` passé explicitement
      2. Table `subscribers` en base (abonnés actifs)
      3. Variable d'env REPORT_EMAILS (fallback)

    Args:
        rows:       résultat de storage.get_todays_report_data()
        date_str:   ex. "lundi 19 mai 2026"
        recipients: liste d'emails (optionnel, override la BDD)

    Returns:
        True si envoi réussi, False sinon.
    """
    if not RESEND_API_KEY:
        print("  ⚠  RESEND_API_KEY manquante — email non envoyé.")
        return False

    if recipients is None:
        # Priorité 1 : abonnés en base
        try:
            import storage
            to = storage.get_subscribers()
        except Exception as e:
            print(f"  ⚠  Impossible de lire les abonnés en base ({e}) — fallback env var.")
            to = []
        # Priorité 2 : env var en fallback
        if not to:
            to = [e.strip() for e in REPORT_EMAILS.split(",") if e.strip()]
    else:
        to = recipients

    if not to:
        print("  ⚠  Aucun destinataire (ni en base, ni dans REPORT_EMAILS).")
        return False

    if not rows:
        print("  ⚠  Aucune matinale aujourd'hui — rapport non envoyé.")
        return False

    html = build_html(rows, date_str)
    subject = f"📺 MediaPulse · Vues matinales du {date_str}"

    payload = {
        "from":    FROM_EMAIL,
        "to":      to,
        "subject": subject,
        "html":    html,
    }

    resp = requests.post(
        "https://api.resend.com/emails",
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type":  "application/json",
        },
        data=json.dumps(payload),
        timeout=15,
    )

    if resp.status_code in (200, 201):
        data = resp.json()
        print(f"  ✓ Email envoyé → {', '.join(to)} (id={data.get('id', '?')})")
        return True
    else:
        print(f"  ✗ Erreur Resend {resp.status_code} : {resp.text}")
        return False
