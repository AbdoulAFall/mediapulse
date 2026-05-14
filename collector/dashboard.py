import os
import sys
from pathlib import Path

import psycopg2
import psycopg2.extras
import streamlit as st
import pandas as pd

# ── Config page ──────────────────────────────────────────────
st.set_page_config(
    page_title="MediaPulse Sénégal",
    page_icon="📺",
    layout="wide",
)

# ── Imports collecteur ───────────────────────────────────────
sys.path.insert(0, str(Path(__file__).parent))
import storage
import detector

# ── DB ───────────────────────────────────────────────────────
storage.init_db()

def query(sql: str, params=()) -> pd.DataFrame:
    conn = psycopg2.connect(os.environ["DATABASE_URL"], cursor_factory=psycopg2.extras.RealDictCursor)
    with conn.cursor() as cur:
        cur.execute(sql, params or None)
        rows = cur.fetchall()
    conn.close()
    return pd.DataFrame([dict(r) for r in rows])

# ── Données ──────────────────────────────────────────────────
@st.cache_data(ttl=300)
def load_data(days: int) -> pd.DataFrame:
    from datetime import datetime, timedelta, timezone
    since = datetime.now(timezone.utc) - timedelta(days=days)
    return query("""
        SELECT
            c.name AS "chaîne",
            m.youtube_video_id,
            m.title AS titre,
            m.published_at,
            m.duration_seconds,
            vs.view_count AS vues,
            vs.like_count AS likes,
            vs.comment_count AS commentaires,
            vs.snapshot_at
        FROM matinales m
        JOIN channels c ON c.id = m.channel_id
        LEFT JOIN view_snapshots vs ON vs.id = (
            SELECT id FROM view_snapshots
            WHERE matinale_id = m.id
            ORDER BY snapshot_at DESC LIMIT 1
        )
        WHERE m.published_at >= %s
        ORDER BY m.published_at DESC
    """, (since,))

# ── Sidebar — Contrôles de sync ──────────────────────────────
with st.sidebar:
    st.header("Synchronisation")

    if st.button("Sync rapide (60 jours)", use_container_width=True, type="primary"):
        with st.status("Synchronisation en cours...", expanded=True) as status:
            try:
                st.write("Résolution des chaînes...")
                channels = detector.sync_channels()
                st.write(f"{len(channels)} chaîne(s) résolue(s)")

                st.write("Détection des matinales...")
                new = detector.detect_matinales(channels, days=60)
                st.write(f"{new} nouvelle(s) matinale(s)")

                st.write("Refresh des vues...")
                detector.refresh_view_counts(days=60)

                status.update(label="Sync terminé ✓", state="complete")
                st.cache_data.clear()
            except Exception as e:
                status.update(label=f"Erreur : {e}", state="error")

    st.divider()

    st.markdown("**Backfill historique**")
    st.caption("Remonte jusqu'à 2 ans en arrière. Durée estimée : 20–30 min.")

    confirm = st.checkbox("Je confirme le lancement du backfill")

    if st.button(
        "Backfill 2 ans",
        use_container_width=True,
        type="secondary",
        disabled=not confirm,
    ):
        with st.status("Backfill en cours (2 ans)...", expanded=True) as status:
            try:
                st.write("Résolution des chaînes...")
                channels = detector.sync_channels()

                st.write("Récupération de l'historique (peut prendre ~20 min)...")
                new = detector.detect_matinales(channels, days=730)
                st.write(f"{new} nouvelle(s) matinale(s) détectée(s)")

                st.write("Refresh des vues...")
                detector.refresh_view_counts(days=730)

                status.update(label=f"Backfill terminé — {new} matinales ✓", state="complete")
                st.cache_data.clear()
            except Exception as e:
                status.update(label=f"Erreur : {e}", state="error")

    st.divider()
    st.caption("Les données se rafraîchissent automatiquement toutes les 5 min.")

# ── Header ───────────────────────────────────────────────────
st.title("📺 MediaPulse Sénégal")
st.caption("Monitoring des matinales TV — 6h00 à 10h00 (UTC)")

# ── Filtres ──────────────────────────────────────────────────
col_f1, col_f2 = st.columns([2, 4])
with col_f1:
    days = st.selectbox(
        "Période",
        [7, 14, 30, 60, 180, 365, 730],
        index=3,
        format_func=lambda d: {
            7: "7 derniers jours", 14: "14 derniers jours", 30: "30 derniers jours",
            60: "60 derniers jours", 180: "6 mois", 365: "1 an", 730: "2 ans",
        }[d],
    )

df = load_data(days)

if df.empty:
    st.info("Aucune donnée pour cette période. Lance un sync depuis le panneau gauche.")
    st.stop()

df["published_at"] = pd.to_datetime(df["published_at"])
df["date"] = df["published_at"].dt.date
df["vues"] = pd.to_numeric(df["vues"], errors="coerce").fillna(0).astype(int)

channels = sorted(df["chaîne"].unique())
with col_f2:
    selected = st.multiselect("Chaînes", channels, default=channels)

df = df[df["chaîne"].isin(selected)]

# ── KPIs ─────────────────────────────────────────────────────
total_matinales = len(df)
total_vues = df["vues"].sum()
avg_vues = int(df["vues"].mean()) if total_matinales else 0
top_chaine = df.groupby("chaîne")["vues"].sum().idxmax() if total_matinales else "—"

k1, k2, k3, k4 = st.columns(4)
k1.metric("Matinales détectées", f"{total_matinales:,}")
k2.metric("Vues cumulées", f"{total_vues:,}")
k3.metric("Vues moy. / épisode", f"{avg_vues:,}")
k4.metric("Chaîne dominante", top_chaine)

st.divider()

# ── Graphiques ───────────────────────────────────────────────
col1, col2 = st.columns(2)

with col1:
    st.subheader("Vues totales par chaîne")
    agg = df.groupby("chaîne")["vues"].sum().sort_values(ascending=False).reset_index()
    st.bar_chart(agg.set_index("chaîne"))

with col2:
    st.subheader("Vues moyennes par épisode")
    avg_ep = df.groupby("chaîne")["vues"].mean().sort_values(ascending=False).reset_index()
    avg_ep["vues"] = avg_ep["vues"].astype(int)
    st.bar_chart(avg_ep.set_index("chaîne"))

# ── Volume de matinales dans le temps ────────────────────────
st.subheader("Volume de matinales par jour")
daily = df.groupby(["date", "chaîne"]).size().reset_index(name="nb")
daily_pivot = daily.pivot(index="date", columns="chaîne", values="nb").fillna(0)
st.area_chart(daily_pivot)

st.divider()

# ── Tableau détaillé ─────────────────────────────────────────
st.subheader("Détail des matinales")

table = df[["date", "chaîne", "titre", "vues", "likes", "duration_seconds"]].copy()
table["durée"] = table["duration_seconds"].apply(
    lambda s: f"{int(s)//3600}h{(int(s)%3600)//60:02d}m" if s and s > 0 else "—"
)
table = table.drop(columns="duration_seconds")
table["lien"] = "https://www.youtube.com/watch?v=" + df["youtube_video_id"]

table = table.sort_values("vues", ascending=False).rename(columns={
    "date": "Date", "chaîne": "Chaîne", "titre": "Titre",
    "vues": "Vues", "likes": "Likes", "durée": "Durée", "lien": "Lien YouTube",
})

st.dataframe(
    table,
    use_container_width=True,
    hide_index=True,
    column_config={
        "Lien YouTube": st.column_config.LinkColumn("Lien YouTube"),
        "Vues": st.column_config.NumberColumn(format="%d"),
    },
)
