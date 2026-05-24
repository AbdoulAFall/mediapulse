"use client";
import { use, useEffect, useState } from "react";
import useSWR from "swr";
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer, ReferenceLine,
} from "recharts";
import PeriodSelector, { Period, periodToParams } from "@/components/PeriodSelector";
import { channelColor } from "@/lib/colors";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function fmt(n: number | null) {
  if (!n) return "—";
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : String(n);
}
function fmtRaw(n: number | null) {
  if (!n) return "—";
  return n.toLocaleString("fr-FR");
}
function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}
function fmtDateLong(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

const PERIODS = [
  { label: "30 j",   value: 30  },
  { label: "60 j",   value: 60  },
  { label: "6 mois", value: 180 },
  { label: "1 an",   value: 365 },
  { label: "2 ans",  value: 730 },
];

// ── Types ─────────────────────────────────────────────────────────────────────
interface ScheduleEntry {
  channel: string;
  avg_start: string;
  avg_end: string;
  avg_start_min: number;
  avg_end_min: number;
  avg_duration: string | null;
  punctuality_min: number;
  episode_count: number;
}
interface Matinale {
  id: number;
  channel: string;
  title: string | null;
  published_at: string;
  duration_seconds: number | null;
  debut: string | null;
  fin: string | null;
  duree: string | null;
  view_count: number | null;
  like_count: number | null;
  youtube_url: string;
}
interface StatsChannel {
  name: string;
  matinales_count: number;
  total_views: number;
  avg_views: number;
  total_likes: number;
}

// ── Stat card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: {
  label: string; value: string; sub?: string; color?: string;
}) {
  return (
    <div className="px-5 py-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-xs font-bold uppercase tracking-widest"
        style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>{label}</p>
      <p className="font-bold mt-1" style={{ fontSize: 26, color: color ?? "var(--ink)", lineHeight: 1 }}>
        {value}
      </p>
      {sub && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{sub}</p>}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function EmissionPage({ params }: { params: Promise<{ channel: string }> }) {
  const { channel: channelSlug } = use(params);
  const channel = decodeURIComponent(channelSlug);
  const color   = channelColor(channel);

  const [period, setPeriod] = useState<Period>({ days: 60, year: null });
  const pq = periodToParams(period);
  const fetcher = (url: string) => fetch(url).then((r) => r.json());

  // Données schedule (horaires moyens)
  const { data: scheduleAll } = useSWR<ScheduleEntry[]>(
    `${API_URL}/api/schedule?${pq}`, fetcher, { dedupingInterval: 5 * 60 * 1000 }
  );
  const schedule = scheduleAll?.find((s) => s.channel === channel);

  // Stats globales
  const { data: statsAll } = useSWR(
    `${API_URL}/api/stats?${pq}`, fetcher, { dedupingInterval: 5 * 60 * 1000 }
  );
  const stats: StatsChannel | undefined = statsAll?.channels?.find(
    (c: StatsChannel) => c.name === channel
  );

  // Matinales (triées par vues pour le top)
  const { data: matinales } = useSWR<Matinale[]>(
    `${API_URL}/api/matinales?${pq}&channel=${encodeURIComponent(channel)}&limit=200`,
    fetcher, { dedupingInterval: 5 * 60 * 1000 }
  );

  // Timeline (pour le graphique tendance)
  const { data: timeline } = useSWR<Record<string, number | string>[]>(
    `${API_URL}/api/timeline?${pq}`, fetcher, { dedupingInterval: 5 * 60 * 1000 }
  );

  // Top 5 épisodes (par vues)
  const top5 = matinales
    ? [...matinales]
        .filter((m) => m.view_count != null)
        .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
        .slice(0, 5)
    : [];

  // 5 derniers épisodes
  const last5 = matinales?.slice(0, 5) ?? [];

  // Données graphique tendance (filtrées sur ce canal)
  const trendData = (timeline ?? [])
    .map((row) => ({ date: row.date as string, views: (row[channel] as number) ?? null }))
    .filter((r) => r.views != null && r.views > 0);

  const avgViews = trendData.length > 0
    ? Math.round(trendData.reduce((s, r) => s + (r.views ?? 0), 0) / trendData.length)
    : null;

  const tickInterval = Math.max(1, Math.floor(trendData.length / 8));

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Bandeau coloré propre à la chaîne */}
      <div style={{ background: color, height: 4 }} />

      {/* ── Header ── */}
      <header style={{ background: "var(--surface)", borderBottom: "2px solid var(--ink)" }}>
        <div className="max-w-5xl mx-auto px-6 py-5 flex items-end justify-between">
          <div>
            <div className="flex items-center gap-3 mb-1">
              <span className="text-xs font-bold px-2 py-0.5"
                style={{ background: color, color: "white", letterSpacing: "0.05em" }}>
                {channel}
              </span>
              <span className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
                Fiche émission
              </span>
            </div>
            <h1 className="font-display font-bold leading-none tracking-tight"
              style={{ fontSize: 34, color: "var(--ink)", fontWeight: 900 }}>
              Matinale d'information
            </h1>
            {schedule && (
              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                Lun–Ven · {schedule.avg_start} → {schedule.avg_end}
                {schedule.avg_duration && ` · ${schedule.avg_duration}`}
                {` · Ponctualité ±${schedule.punctuality_min} min`}
              </p>
            )}
          </div>
          <a href="/dashboard" className="text-xs font-semibold"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}>
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 flex flex-col gap-8">

        {/* ── Sélecteur période ── */}
        <PeriodSelector value={period} onChange={setPeriod} />

        {/* ── KPIs ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px"
          style={{ background: "var(--border)", border: "1px solid var(--border)" }}>
          <StatCard
            label="Épisodes suivis"
            value={String(stats?.matinales_count ?? schedule?.episode_count ?? "—")}
            sub={period.year ? `en ${period.year}` : `sur ${period.days} jours`}
          />
          <StatCard
            label="Vues moyennes"
            value={fmt(stats?.avg_views ?? null)}
            sub="par épisode"
            color={color}
          />
          <StatCard
            label="Total vues"
            value={fmt(stats?.total_views ?? null)}
            sub={period.year ? `en ${period.year}` : `sur ${period.days} jours`}
          />
          <StatCard
            label="Horaire moyen"
            value={schedule?.avg_start ?? "—"}
            sub={`fin vers ${schedule?.avg_end ?? "—"}`}
          />
        </div>

        {/* ── Graphique tendance ── */}
        {trendData.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 pt-4 pb-3" style={{ borderBottom: "2px solid var(--ink)" }}>
              <p className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Tendance</p>
              <h2 className="font-display font-bold mt-0.5"
                style={{ fontSize: 18, color: "var(--ink)" }}>
                Vues par épisode · {period.year ?? `${period.days} derniers jours`}
              </h2>
            </div>
            <div className="px-4 py-5">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={trendData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tickFormatter={fmtDate} interval={tickInterval}
                    tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                    axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={fmt}
                    tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                    axisLine={false} tickLine={false} width={52} />
                  {avgViews && (
                    <ReferenceLine y={avgViews} stroke={color} strokeDasharray="4 4"
                      label={{ value: `Moy. ${fmt(avgViews)}`, fill: color, fontSize: 10, position: "right" }} />
                  )}
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: `1px solid ${color}`, fontSize: 12 }}
                    labelFormatter={(d) => fmtDateLong(d)}
                    formatter={(v: number) => [fmtRaw(v) + " vues", channel]}
                  />
                  <Line type="monotone" dataKey="views"
                    stroke={color} strokeWidth={2.5}
                    dot={{ r: 3, fill: color, strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                    connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
              {avgViews && (
                <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                  — — Ligne pointillée = moyenne sur la période ({fmt(avgViews)} vues)
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Top 5 épisodes ── */}
        {top5.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "2px solid var(--ink)" }}>
              <p className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Performances</p>
              <h2 className="font-display font-bold mt-0.5"
                style={{ fontSize: 18, color: "var(--ink)" }}>
                Top 5 épisodes les plus vus
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    {["#", "Date", "Titre", "Début", "Durée", "Vues", "Likes", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-bold uppercase"
                        style={{ color: "var(--text-muted)", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {top5.map((m, i) => (
                    <tr key={m.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: i === 0 ? "#fff8f8" : i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                      }}>
                      <td className="px-4 py-3 font-bold" style={{ color: i === 0 ? color : "var(--text-muted)" }}>
                        {i === 0 ? "★" : `#${i + 1}`}
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {new Date(m.published_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate"
                        style={{ color: "var(--text-muted)" }} title={m.title ?? ""}>
                        {m.title ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                        {m.debut ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {m.duree ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-bold whitespace-nowrap"
                        style={{ color: color }}>
                        {fmt(m.view_count)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {fmt(m.like_count)}
                      </td>
                      <td className="px-4 py-3">
                        <a href={m.youtube_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-bold hover:opacity-70"
                          style={{ color, textDecoration: "none" }}>
                          ▶ voir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── 5 derniers épisodes ── */}
        {last5.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: "2px solid var(--ink)" }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Récent</p>
                <h2 className="font-display font-bold mt-0.5"
                  style={{ fontSize: 18, color: "var(--ink)" }}>
                  5 derniers épisodes
                </h2>
              </div>
              <a href={`/matinales?channels=${encodeURIComponent(channel)}`}
                className="text-xs font-bold uppercase tracking-widest hover:opacity-70"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em", textDecoration: "none" }}>
                Tous les épisodes →
              </a>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    {["Date", "Titre", "Début", "Fin", "Durée", "Vues", "Likes", ""].map((h) => (
                      <th key={h} className="px-4 py-2.5 text-left font-bold uppercase"
                        style={{ color: "var(--text-muted)", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {last5.map((m, i) => (
                    <tr key={m.id}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                      }}>
                      <td className="px-4 py-3 font-mono whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {new Date(m.published_at).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3 max-w-xs truncate"
                        style={{ color: "var(--text-muted)" }} title={m.title ?? ""}>
                        {m.title ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono font-semibold whitespace-nowrap">
                        {m.debut ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {m.fin ?? "—"}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {m.duree ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-bold whitespace-nowrap"
                        style={{ color: m.view_count ? color : "var(--text-muted)" }}>
                        {fmt(m.view_count)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap"
                        style={{ color: "var(--text-muted)" }}>
                        {fmt(m.like_count)}
                      </td>
                      <td className="px-4 py-3">
                        <a href={m.youtube_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-bold hover:opacity-70"
                          style={{ color, textDecoration: "none" }}>
                          ▶ voir
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Placeholder Whisper ── */}
        <div className="px-5 py-6 text-center"
          style={{ border: "1px dashed var(--border)", background: "var(--surface)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            Bientôt disponible
          </p>
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Présentateurs · Thèmes récurrents · Résumé automatique — après intégration Whisper
          </p>
        </div>

      </main>

      <footer className="max-w-5xl mx-auto px-6 py-6 mt-4"
        style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          MediaPulse · {channel} · Données YouTube · Sync automatique lun–ven (UTC)
        </p>
      </footer>
    </div>
  );
}
