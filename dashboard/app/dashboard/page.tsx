"use client";
import { useState } from "react";
import useSWR from "swr";
import {
  fetchStats, fetchMatinales, fetchTimeline, fetchSchedule, fetchViewsEvolution,
  StatsResponse, Matinale, ScheduleEntry, MatinaleEvolution, SpecialEvent,
} from "@/lib/api";
import KPICards           from "@/components/KPICards";
import ViewsChart         from "@/components/ViewsChart";
import ShareChart         from "@/components/ShareChart";
import TimelineChart      from "@/components/TimelineChart";
import MatinalesTable     from "@/components/MatinalesTable";
import ScheduleGuide      from "@/components/ScheduleGuide";
import ViewEvolutionChart from "@/components/ViewEvolutionChart";
import PeriodSelector, { Period, periodToParams } from "@/components/PeriodSelector";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const SWR_OPTIONS = {
  dedupingInterval: 5 * 60 * 1000,
  revalidateOnFocus: false,
  errorRetryCount: 2,
};

const fetcher = (url: string) =>
  fetch(url).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });

function today() {
  return new Date().toLocaleDateString("fr-FR", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>({ days: 60, year: null });
  const [selectedChannel, setSelectedChannel] = useState<string | undefined>();

  const pq = periodToParams(period);

  const { data: stats,     error: statsError,    isLoading: statsLoading }    =
    useSWR<StatsResponse>(`${API_URL}/api/stats?${pq}`, fetcher, SWR_OPTIONS);
  const { data: matinales, error: matinalesError, isLoading: matinalesLoading } =
    useSWR<Matinale[]>(
      `${API_URL}/api/matinales?${pq}${selectedChannel ? `&channel=${encodeURIComponent(selectedChannel)}` : ""}`,
      fetcher, SWR_OPTIONS
    );
  const { data: timeline,  isLoading: timelineLoading } =
    useSWR<Record<string, number | string>[]>(`${API_URL}/api/timeline?${pq}`, fetcher, SWR_OPTIONS);
  const { data: events } =
    useSWR<SpecialEvent[]>(`${API_URL}/api/events`, fetcher, { ...SWR_OPTIONS, dedupingInterval: 60 * 60 * 1000 });
  const { data: schedule } =
    useSWR<ScheduleEntry[]>(`${API_URL}/api/schedule?${pq}`, fetcher, SWR_OPTIONS);

  // Evolution J0 — refresh toutes les 2 min (données live)
  const todayDate = new Date().toISOString().slice(0, 10);
  const { data: evolution } =
    useSWR<MatinaleEvolution[]>(["evolution", todayDate], () => fetchViewsEvolution(todayDate), {
      dedupingInterval: 2 * 60 * 1000,   // 2 min
      revalidateOnFocus: true,
      errorRetryCount: 2,
      refreshInterval: 2 * 60 * 1000,    // revalide toutes les 2 min
    });

  const loading  = statsLoading || matinalesLoading || timelineLoading;
  const error    = statsError || matinalesError;
  const channels = stats?.channels.map((c) => c.name) ?? [];

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>

      {/* ── Bandeau top rouge ── */}
      <div style={{ background: "var(--accent)", height: 4 }} />

      {/* ── Masthead ── */}
      <header style={{ background: "var(--surface)", borderBottom: "2px solid var(--ink)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-end justify-between">
            <div>
              <h1
                className="font-display leading-none tracking-tight"
                style={{ fontSize: 40, color: "var(--ink)", fontWeight: 900 }}
              >
                MEDIAPULSE
              </h1>
              <p className="text-xs font-semibold tracking-widest uppercase mt-1"
                style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}>
                Intelligence · Matinales TV Sénégal
              </p>
            </div>
            <div className="text-right hidden md:block">
              <p className="text-xs uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                {today()}
              </p>
              {loading && (
                <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>
                  ● Actualisation…
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── Barre de filtres ── */}
      <div style={{ background: "var(--surface)", borderBottom: "1px solid var(--border)" }}>
        <div className="max-w-7xl mx-auto px-6 py-2 flex flex-wrap items-center gap-6">

          {/* Période */}
          <PeriodSelector value={period} onChange={setPeriod} />

          {/* Séparateur */}
          {channels.length > 0 && (
            <div style={{ width: 1, height: 20, background: "var(--border)" }} />
          )}

          {/* Chaînes */}
          {channels.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-xs font-semibold uppercase tracking-wider mr-2"
                style={{ color: "var(--text-muted)" }}>Chaîne</span>
              <button onClick={() => setSelectedChannel(undefined)}
                className="px-3 py-1 text-xs font-semibold transition-all"
                style={{
                  background:   !selectedChannel ? "var(--ink)" : "transparent",
                  color:        !selectedChannel ? "white"       : "var(--text-muted)",
                  borderRadius: 2,
                }}>
                Toutes
              </button>
              {channels.map((ch) => (
                <button key={ch}
                  onClick={() => setSelectedChannel(ch === selectedChannel ? undefined : ch)}
                  className="px-3 py-1 text-xs font-semibold transition-all"
                  style={{
                    background:   selectedChannel === ch ? "var(--ink)" : "transparent",
                    color:        selectedChannel === ch ? "white"       : "var(--text-muted)",
                    borderRadius: 2,
                  }}>
                  {ch}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Erreur */}
        {error && (
          <div className="p-4 mb-6 text-sm font-medium"
            style={{ background: "var(--accent-light)", borderLeft: "4px solid var(--accent)", color: "var(--accent)" }}>
            ⚠ Impossible de contacter l&apos;API — vérifie que Railway est bien déployé.
          </div>
        )}

        {/* KPIs */}
        {statsLoading && !stats
          ? <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 96 }} />)}
            </div>
          : stats && <KPICards stats={stats} />
        }

        {/* Charts */}
        {statsLoading && !stats
          ? <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              <div className="skeleton" style={{ height: 300 }} />
              <div className="skeleton" style={{ height: 300 }} />
            </div>
          : <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {stats    && <ShareChart  channels={stats.channels} />}
              {timeline && timeline.length > 0 && <TimelineChart data={timeline} events={events ?? []} />}
            </div>
        }

        {/* Guide horaires */}
        {schedule && schedule.length > 0 && <ScheduleGuide data={schedule} />}

        {/* Évolution vues J0 */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
              Vues en temps réel · J0
            </span>
            <a href="/evolution"
              className="text-xs font-bold uppercase tracking-widest hover:opacity-70 transition-opacity"
              style={{ color: "var(--text-muted)", letterSpacing: "0.12em", textDecoration: "none" }}>
              Voir le détail →
            </a>
          </div>
          <ViewEvolutionChart
            evolutions={evolution ?? []}
            date={todayDate}
          />
        </div>

        {/* Table */}
        {matinalesLoading && !matinales
          ? <div className="skeleton" style={{ height: 300 }} />
          : matinales && matinales.length > 0 && <MatinalesTable matinales={matinales} />
        }

      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-6 py-6 mt-4"
        style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          MediaPulse · Données YouTube · Sync automatique lun–ven 6h–12h (UTC)
        </p>
      </footer>

    </div>
  );
}
