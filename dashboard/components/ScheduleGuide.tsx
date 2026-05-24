"use client";
import { ScheduleEntry } from "@/lib/api";
import { channelColor } from "@/lib/colors";

const RANGE_START = 6 * 60;
const RANGE_END   = 12 * 60 + 30;
const RANGE       = RANGE_END - RANGE_START;

const TICKS = Array.from({ length: Math.floor(RANGE / 30) + 1 }, (_, i) => {
  const min = RANGE_START + i * 30;
  const h   = Math.floor(min / 60);
  const m   = min % 60;
  return { min, label: `${String(h).padStart(2,"0")}h${m === 0 ? "00" : "30"}` };
});

function pct(min: number) {
  return Math.min(100, Math.max(0, ((min - RANGE_START) / RANGE) * 100));
}

export default function ScheduleGuide({ data }: { data: ScheduleEntry[] }) {
  if (!data.length) return null;

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      className="mb-6">

      {/* Titre section */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: "2px solid var(--ink)" }}>
        <p className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Grille de programmes
        </p>
        <h2 className="font-display font-bold mt-0.5" style={{ fontSize: 18, color: "var(--ink)" }}>
          Horaires moyens de diffusion
        </h2>
      </div>

      <div className="p-5 overflow-x-auto">
        <div className="flex gap-4" style={{ minWidth: 600 }}>

          {/* Labels chaînes */}
          <div className="flex flex-col shrink-0" style={{ width: 116 }}>
            <div style={{ height: 28 }} />
            {data.map((entry) => (
              <a key={entry.channel}
                href={`/emissions/${encodeURIComponent(entry.channel)}`}
                className="flex items-center h-10 mb-2 text-xs font-bold uppercase hover:opacity-60 transition-opacity"
                style={{ color: "var(--ink)", letterSpacing: "0.05em", textDecoration: "none" }}>
                {entry.channel}
              </a>
            ))}
          </div>

          {/* Zone Gantt */}
          <div className="flex-1 min-w-0">
            {/* Ticks */}
            <div className="relative mb-1" style={{ height: 28 }}>
              {TICKS.map((t) => (
                <span key={t.min}
                  className="absolute text-xs font-mono font-semibold transform -translate-x-1/2"
                  style={{ left: `${pct(t.min)}%`, top: 6, color: "var(--text-muted)", fontSize: 10 }}>
                  {t.label}
                </span>
              ))}
            </div>

            {/* Grille + barres */}
            <div className="relative">
              {/* Lignes verticales */}
              {TICKS.map((t) => (
                <div key={t.min} className="absolute top-0 bottom-0"
                  style={{ left: `${pct(t.min)}%`, width: 1, background: "var(--border)" }} />
              ))}

              {/* Barre chaîne */}
              {data.map((entry, i) => {
                const color    = channelColor(entry.channel, i);
                const startPct = pct(entry.avg_start_min);
                const widthPct = Math.max(1, pct(entry.avg_end_min) - startPct);

                return (
                  <div key={entry.channel} className="relative h-10 mb-2">
                    <a href={`/emissions/${encodeURIComponent(entry.channel)}`}
                      className="absolute h-8 top-1 group"
                      style={{ left: `${startPct}%`, width: `${widthPct}%`,
                               background: color, opacity: 0.9, cursor: "pointer",
                               textDecoration: "none", display: "block" }}>
                      {/* Label dans la barre */}
                      <span className="absolute inset-0 flex items-center px-2 text-xs font-bold text-white truncate"
                        style={{ fontSize: 11 }}>
                        {entry.avg_start} — {entry.avg_end}
                      </span>

                      {/* Tooltip */}
                      <div className="absolute left-0 top-full mt-1 z-30 p-3 hidden group-hover:block"
                        style={{ background: "var(--ink)", color: "white",
                                 minWidth: 190, boxShadow: "4px 4px 0 rgba(0,0,0,0.3)" }}>
                        <p className="font-bold text-sm mb-2 pb-1"
                          style={{ borderBottom: "1px solid rgba(255,255,255,0.2)" }}>
                          {entry.channel}
                        </p>
                        <div className="space-y-1" style={{ fontSize: 11 }}>
                          <p><span style={{ opacity: 0.6 }}>Début moy. </span>
                             <strong>{entry.avg_start}</strong></p>
                          <p><span style={{ opacity: 0.6 }}>Fin moy. </span>
                             <strong>{entry.avg_end}</strong></p>
                          <p><span style={{ opacity: 0.6 }}>Durée moy. </span>
                             <strong>{entry.avg_duration ?? "—"}</strong></p>
                          <p><span style={{ opacity: 0.6 }}>Ponctualité </span>
                             <strong>±{entry.punctuality_min} min</strong></p>
                          <p><span style={{ opacity: 0.6 }}>Épisodes analysés </span>
                             <strong>{entry.episode_count}</strong></p>
                        </div>
                      </div>
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Légende bas */}
        <p className="text-xs mt-4 pt-3" style={{ borderTop: "1px solid var(--border)", color: "var(--text-muted)" }}>
          Cliquer sur une barre pour voir la fiche émission · Survoler pour le détail · ±X min = régularité de l&apos;heure de début
        </p>
      </div>
    </div>
  );
}
