import sqlite3
import os
from pathlib import Path
from collections import defaultdict
from datetime import datetime, timedelta

import streamlit as st
import pandas as pd

# ── Config page ──────────────────────────────────────────────
st.set_page_config(
    page_title="MediaPulse Sénégal",
    page_icon="📺",
    layout="wide",
)

# ── DB ───────────────────────────────────────────────────────
DB_PATH = Path(__file__).parent.parent / "mediapulse.db"

def query(sql: str, params=()) -> pd.DataFrame:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(sql, conn, params=params)
    conn.close()
    return df

# ── Données ──────────────────────────────────────────────────
@st.cache_data(ttl=300)
def load_data(days: int) -> pd.DataFrame:
    return query(f"""
        SELECT
            c.name AS chaîne,
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
        WHERE m.published_at >= datetime('now', '-{days} days')
        ORDER BY m.published_at DESC
    """)

# ── Header ───────────────────────────────────────────────────
st.title("📺 MediaPulse Sénégal")
st.caption("Monitoring des matinales TV — 6h00 à 10h00 (UTC)")

# ── Filtres ──────────────────────────────────────────────────
col_f1, col_f2 = st.columns([2, 4])
with col_f1:
    days = st.selectbox("Période", [7, 14, 30, 60], index=3, format_func=lambda d: f"{d} derniers jours")

df = load_data(days)

if df.empty:
    st.warning("Aucune donnée. Lance d'abord : python main.py sync")
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
    "vues": "Vues", "likes": "Likes", "durée": "Durée", "lien": "Lien YouTube"
})

st.dataframe(
    table,
    use_container_width=True,
    hide_index=True,
    column_config={
        "Lien YouTube": st.column_config.LinkColumn("Lien YouTube"),
        "Vues": st.column_config.NumberColumn(format="%d"),
    }
)
