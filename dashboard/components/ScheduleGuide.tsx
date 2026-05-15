"use client";
import { ScheduleEntry } from "@/lib/api";

// Plage affichée : 6h00 → 12h30 (en minutes depuis minuit)
const RANGE_START = 6 * 60;   // 360
const RANGE_END   = 12 * 60 + 30; // 750
const RANGE       = RANGE_END - RANGE_START; // 390 min

const COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#22c55e",
  "#14b8a6","#3b82f6","#f97316","#a855f7","#ef4444",
];

// Ticks toutes les 30 min
const TICKS = Array.from({ length: Math.floor(RANGE / 30) + 1 }, (_, i) => {
  const min = RANGE_START + i * 30;
  return { min, label: `${String(min / 60 | 0).padStart(2, "0")}h${min % 60 === 0 ? "00" : "30"}` };
});

function pct(min: number) {
  return Math.min(100, Math.max(0, ((min - RANGE_START) / RANGE) * 100));
}

export default function ScheduleGuide({ data }: { data: ScheduleEntry[] }) {
  if (!data.length) return null;

  return (
    <div
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      className="rounded-xl p-5 mb-6"
    >
      {/* Titre */}
      <div className="flex items-center justify-between mb-6">
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Guide des horaires
        </h2>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          Moyennes sur la période sélectionnée
        </span>
      </div>

      {/* Grille */}
      <div className="flex gap-4">
        {/* Labels chaînes */}
        <div className="flex flex-col gap-3 shrink-0" style={{ width: 120 }}>
          <div style={{ height: 24 }} /> {/* espace header ticks */}
          {data.map((entry) => (
            <div
              key={entry.channel}
              className="flex items-center h-9 text-xs font-semibold truncate"
              style={{ color: "var(--text)" }}
            >
              {entry.channel}
            </div>
          ))}
        </div>

        {/* Zone graphique */}
        <div className="flex-1 min-w-0">
          {/* Ticks horaires */}
          <div className="relative h-6 mb-0">
            {TICKS.map((t) => (
              <span
                key={t.min}
                className="absolute text-xs transform -translate-x-1/2"
                style={{ left: `${pct(t.min)}%`, color: "var(--text-muted)", top: 0 }}
              >
                {t.label}
              </span>
            ))}
          </div>

          {/* Lignes de grille + barres */}
          <div className="relative">
            {/* Lignes verticales de grille */}
            {TICKS.map((t) => (
              <div
                key={t.min}
                className="absolute top-0 bottom-0"
                style={{
                  left: `${pct(t.min)}%`,
                  width: 1,
                  background: "var(--border)",
                }}
              />
            ))}

            {/* Barre par chaîne */}
            {data.map((entry, i) => {
              const startPct = pct(entry.avg_start_min);
              const endPct   = pct(entry.avg_end_min);
              const widthPct = Math.max(1, endPct - startPct);
              const color    = COLORS[i % COLORS.length];

              return (
                <div key={entry.channel} className="relative flex items-center h-9 mb-3">
                  {/* Barre principale */}
                  <div
                    className="absolute h-7 rounded-md flex items-center px-2 overflow-hidden group cursor-default"
                    style={{
                      left: `${startPct}%`,
                      width: `${widthPct}%`,
                      background: `${color}33`,
                      border: `1.5px solid ${color}`,
                    }}
                  >
                    <span
                      className="text-xs font-medium whitespace-nowrap overflow-hidden"
                      style={{ color }}
                    >
                      {entry.avg_start} → {entry.avg_end}
                    </span>

                    {/* Tooltip au hover */}
                    <div
                      className="absolute left-0 top-full mt-1 z-20 rounded-lg p-3 text-xs hidden group-hover:block"
                      style={{
                        background: "var(--surface2)",
                        border: "1px solid var(--border)",
                        minWidth: 180,
                        boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
                      }}
                    >
                      <p className="font-semibold mb-1" style={{ color: "var(--text)" }}>
                        {entry.channel}
                      </p>
                      <p style={{ color: "var(--text-muted)" }}>
                        Début moy. : <strong style={{ color: "var(--text)" }}>{entry.avg_start}</strong>
                      </p>
                      <p style={{ color: "var(--text-muted)" }}>
                        Fin moy. : <strong style={{ color: "var(--text)" }}>{entry.avg_end}</strong>
                      </p>
                      <p style={{ color: "var(--text-muted)" }}>
                        Durée moy. : <strong style={{ color: "var(--text)" }}>{entry.avg_duration ?? "—"}</strong>
                      </p>
                      <p style={{ color: "var(--text-muted)" }}>
                        Ponctualité : <strong style={{ color: "var(--text)" }}>±{entry.punctuality_min} min</strong>
                      </p>
                      <p style={{ color: "var(--text-muted)" }}>
                        Épisodes : <strong style={{ color: "var(--text)" }}>{entry.episode_count}</strong>
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Légende */}
      <div
        className="flex gap-6 mt-4 pt-4 text-xs flex-wrap"
        style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}
      >
        <span>📌 Passe la souris sur une barre pour les détails</span>
        <span>⏱ ±X min = écart-type de l&apos;heure de début (régularité)</span>
      </div>
    </div>
  );
}
