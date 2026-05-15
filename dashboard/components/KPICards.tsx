"use client";
import { StatsResponse } from "@/lib/api";

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)} k`
    : String(n);
}

export default function KPICards({ stats }: { stats: StatsResponse }) {
  const top = stats.channels[0];
  const avg = Math.round(stats.total_views / (stats.total_matinales || 1));

  const cards = [
    {
      label: "Matinales détectées",
      value: fmt(stats.total_matinales),
      sub: `${stats.period_days} derniers jours`,
      accent: false,
    },
    {
      label: "Vues cumulées",
      value: fmt(stats.total_views),
      sub: "toutes chaînes",
      accent: true,
    },
    {
      label: "Vues moy. / épisode",
      value: fmt(avg),
      sub: "moyenne globale",
      accent: false,
    },
    {
      label: "Chaîne dominante",
      value: top?.name ?? "—",
      sub: top ? `${fmt(top.total_views)} vues` : "aucune donnée",
      accent: false,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-0 mb-8"
      style={{ border: "2px solid var(--ink)" }}>
      {cards.map(({ label, value, sub, accent }, i) => (
        <div key={label}
          className="p-5 relative"
          style={{
            background:  accent ? "var(--ink)" : "var(--surface)",
            borderRight: i < 3 ? "1px solid var(--border)" : "none",
            borderLeft:  i > 0 ? undefined : undefined,
          }}>
          {/* Ligne rouge en haut */}
          {accent && (
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "var(--accent)" }} />
          )}
          <p className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: accent ? "rgba(255,255,255,0.5)" : "var(--text-muted)", letterSpacing: "0.15em" }}>
            {label}
          </p>
          <p className="font-display leading-none mb-2"
            style={{ fontSize: 36, fontWeight: 900, color: accent ? "white" : "var(--ink)" }}>
            {value}
          </p>
          <p className="text-xs"
            style={{ color: accent ? "rgba(255,255,255,0.4)" : "var(--text-muted)" }}>
            {sub}
          </p>
        </div>
      ))}
    </div>
  );
}
