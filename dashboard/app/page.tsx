"use client";
import { useState, useEffect } from "react";
import { fetchStats, fetchMatinales, fetchTimeline, StatsResponse, Matinale } from "@/lib/api";
import KPICards from "@/components/KPICards";
import ViewsChart from "@/components/ViewsChart";
import TimelineChart from "@/components/TimelineChart";
import MatinalesTable from "@/components/MatinalesTable";

const PERIODS = [
  { label: "7 jours", value: 7 },
  { label: "30 jours", value: 30 },
  { label: "60 jours", value: 60 },
  { label: "6 mois", value: 180 },
  { label: "1 an", value: 365 },
  { label: "2 ans", value: 730 },
];

export default function Dashboard() {
  const [days, setDays] = useState(60);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [matinales, setMatinales] = useState<Matinale[]>([]);
  const [timeline, setTimeline] = useState<Record<string, number | string>[]>([]);
  const [selectedChannel, setSelectedChannel] = useState<string | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([
      fetchStats(days),
      fetchMatinales(days, selectedChannel),
      fetchTimeline(days),
    ])
      .then(([s, m, t]) => {
        setStats(s);
        setMatinales(m);
        setTimeline(t);
      })
      .catch((err) => {
        setError(err?.message ?? "Erreur de chargement des données.");
      })
      .finally(() => setLoading(false));
  }, [days, selectedChannel]);

  const channels = stats?.channels.map((c) => c.name) ?? [];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      {/* Header */}
      <header
        style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}
        className="sticky top-0 z-10"
      >
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📺</span>
            <div>
              <h1 className="font-bold text-lg leading-none">MediaPulse</h1>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                Sénégal · Matinales TV
              </p>
            </div>
          </div>
          {loading && (
            <span
              className="text-xs px-3 py-1 rounded-full"
              style={{ background: "var(--surface2)", color: "var(--text-muted)" }}
            >
              Chargement…
            </span>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Filtres */}
        <div className="flex flex-wrap gap-3 mb-8">
          {/* Période */}
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: "var(--surface)" }}>
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => setDays(p.value)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: days === p.value ? "var(--accent)" : "transparent",
                  color: days === p.value ? "white" : "var(--text-muted)",
                }}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Chaînes */}
          {channels.length > 0 && (
            <div
              className="flex gap-1 p-1 rounded-lg flex-wrap"
              style={{ background: "var(--surface)" }}
            >
              <button
                onClick={() => setSelectedChannel(undefined)}
                className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                style={{
                  background: !selectedChannel ? "var(--accent)" : "transparent",
                  color: !selectedChannel ? "white" : "var(--text-muted)",
                }}
              >
                Toutes
              </button>
              {channels.map((ch) => (
                <button
                  key={ch}
                  onClick={() => setSelectedChannel(ch === selectedChannel ? undefined : ch)}
                  className="px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                  style={{
                    background: selectedChannel === ch ? "var(--accent)" : "transparent",
                    color: selectedChannel === ch ? "white" : "var(--text-muted)",
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Erreur */}
        {error && (
          <div
            className="rounded-xl p-5 mb-8 text-sm"
            style={{ background: "#2d1b1b", border: "1px solid #7f1d1d", color: "#fca5a5" }}
          >
            ⚠️ {error} — Vérifie que l&apos;API Railway est bien déployée.
          </div>
        )}

        {/* Skeleton loading */}
        {loading && !stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="skeleton rounded-xl" style={{ height: 100 }} />
            ))}
          </div>
        )}

        {/* KPIs */}
        {stats && <KPICards stats={stats} />}

        {/* Charts */}
        {loading && !stats ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <div className="skeleton rounded-xl" style={{ height: 320 }} />
            <div className="skeleton rounded-xl" style={{ height: 320 }} />
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {stats && <ViewsChart channels={stats.channels} />}
            {timeline.length > 0 && <TimelineChart data={timeline} />}
          </div>
        )}

        {/* Table */}
        {loading && !matinales.length ? (
          <div className="skeleton rounded-xl" style={{ height: 300 }} />
        ) : (
          matinales.length > 0 && <MatinalesTable matinales={matinales} />
        )}
      </main>
    </div>
  );
}
