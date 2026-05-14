"use client";
import { StatsResponse } from "@/lib/api";

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)}k`
    : String(n);
}

export default function KPICards({ stats }: { stats: StatsResponse }) {
  const top = stats.channels[0];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
      {[
        { label: "Matinales détectées", value: fmt(stats.total_matinales), sub: `${stats.period_days} derniers jours` },
        { label: "Vues cumulées", value: fmt(stats.total_views), sub: "toutes chaînes" },
        { label: "Vues moy./épisode", value: fmt(Math.round(stats.total_views / (stats.total_matinales || 1))), sub: "moyenne globale" },
        { label: "Chaîne dominante", value: top?.name ?? "—", sub: top ? `${fmt(top.total_views)} vues` : "" },
      ].map(({ label, value, sub }) => (
        <div key={label} style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
          className="rounded-xl p-5">
          <p style={{ color: "var(--text-muted)" }} className="text-xs uppercase tracking-wider mb-2">{label}</p>
          <p className="text-3xl font-bold" style={{ color: "var(--text)" }}>{value}</p>
          <p style={{ color: "var(--text-muted)" }} className="text-xs mt-1">{sub}</p>
        </div>
      ))}
    </div>
  );
}
