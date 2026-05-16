"use client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
} from "recharts";
import { MatinaleEvolution } from "@/lib/api";

const CHANNEL_COLORS: Record<string, string> = {
  "TFM":         "#d0021b",
  "RTS":         "#1a1714",
  "2STV":        "#c0392b",
  "Sen TV":      "#4a4440",
  "Walf TV":     "#7a736a",
  "Solution TV": "#8b0000",
};
const FALLBACK_COLORS = ["#333", "#555", "#777", "#999"];

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : String(n);
}

function channelColor(name: string, idx: number): string {
  return CHANNEL_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

function buildChartData(evolutions: MatinaleEvolution[]) {
  // Collecte tous les timestamps uniques (HH:MM)
  const timesSet = new Set<string>();
  for (const ev of evolutions) {
    for (const snap of ev.snapshots) {
      timesSet.add(snap.time);
    }
  }
  const times = Array.from(timesSet).sort();

  // Pour chaque timestamp, on construit un point avec les vues de chaque chaîne
  return times.map((t) => {
    const point: Record<string, string | number | null> = { time: t };
    for (const ev of evolutions) {
      const snap = ev.snapshots.find((s) => s.time === t);
      // Clé = channel (unique par jour car 1 matinale/chaîne/jour)
      point[ev.channel] = snap?.view_count ?? null;
    }
    return point;
  });
}

interface Props {
  evolutions: MatinaleEvolution[];
  date?: string; // YYYY-MM-DD
}

// Tooltip custom
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--ink)",
      padding: "10px 14px", fontSize: 12, minWidth: 160,
    }}>
      <p style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
        {label}
      </p>
      {sorted.map((p) => (
        p.value != null && (
          <div key={p.name} className="flex items-center gap-2 mb-1">
            <span style={{
              display: "inline-block", width: 8, height: 8,
              borderRadius: "50%", background: p.color, flexShrink: 0,
            }} />
            <span style={{ color: "var(--text-muted)" }}>{p.name}</span>
            <span style={{ fontWeight: 700, color: "var(--ink)", marginLeft: "auto" }}>
              {fmt(p.value)}
            </span>
          </div>
        )
      ))}
    </div>
  );
}

export default function ViewEvolutionChart({ evolutions, date }: Props) {
  if (!evolutions || evolutions.length === 0) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: "2px solid var(--ink)" }}>
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            Évolution J0
          </p>
          <h2 className="font-display font-bold mt-0.5" style={{ fontSize: 18, color: "var(--ink)" }}>
            Vues en temps réel
          </h2>
        </div>
        <div className="p-5">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Aucun snapshot disponible pour aujourd&apos;hui. Les données apparaîtront dès la prochaine synchronisation (toutes les 15 min).
          </p>
        </div>
      </div>
    );
  }

  const data = buildChartData(evolutions);

  // Détermine si on est sur aujourd'hui
  const isToday = !date || date === new Date().toISOString().slice(0, 10);

  // Nombre de snapshots max pour afficher la fréquence
  const maxSnaps = Math.max(...evolutions.map((e) => e.snapshots.length));

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {/* ── Header ── */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: "2px solid var(--ink)" }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
              Évolution J0
            </p>
            <h2 className="font-display font-bold mt-0.5" style={{ fontSize: 18, color: "var(--ink)" }}>
              Vues en temps réel · {date ?? new Date().toISOString().slice(0, 10)}
            </h2>
          </div>
          {isToday && (
            <span className="text-xs font-semibold px-2 py-1 mt-1"
              style={{ background: "var(--accent)", color: "white", letterSpacing: "0.05em" }}>
              ● LIVE
            </span>
          )}
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {evolutions.length} matinale{evolutions.length > 1 ? "s" : ""} · {maxSnaps} mesure{maxSnaps > 1 ? "s" : ""} · snapshot toutes les 15 min
        </p>
      </div>

      {/* ── Frise chronologique ── */}
      <div className="p-5">
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="time"
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tickFormatter={fmt}
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
            />
            {evolutions.map((ev, idx) => (
              <Line
                key={ev.matinale_id}
                type="monotone"
                dataKey={ev.channel}
                stroke={channelColor(ev.channel, idx)}
                strokeWidth={2}
                dot={{ r: 3, fill: channelColor(ev.channel, idx) }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Liste des matinales avec lien YouTube ── */}
      <div className="px-5 pb-5">
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            Détail
          </p>
          <div className="flex flex-col gap-2">
            {evolutions.map((ev, idx) => {
              const last = ev.snapshots[ev.snapshots.length - 1];
              const first = ev.snapshots[0];
              const growth = last && first && first.view_count && last.view_count
                ? last.view_count - first.view_count
                : null;
              return (
                <div key={ev.matinale_id} className="flex items-center gap-3">
                  {/* Couleur chaîne */}
                  <span style={{
                    display: "inline-block", width: 10, height: 10,
                    borderRadius: "50%", background: channelColor(ev.channel, idx), flexShrink: 0,
                  }} />
                  {/* Infos */}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                      {ev.channel}
                    </span>
                    {ev.title && (
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                        {ev.title.length > 60 ? ev.title.slice(0, 60) + "…" : ev.title}
                      </span>
                    )}
                  </div>
                  {/* Vues actuelles + progression */}
                  <div className="text-right flex-shrink-0">
                    {last?.view_count != null && (
                      <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                        {fmt(last.view_count)}
                      </span>
                    )}
                    {growth != null && growth > 0 && (
                      <span className="text-xs ml-2" style={{ color: "#2e7d32" }}>
                        +{fmt(growth)}
                      </span>
                    )}
                  </div>
                  {/* Lien YouTube */}
                  <a
                    href={`https://www.youtube.com/watch?v=${ev.youtube_video_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-semibold flex-shrink-0"
                    style={{
                      color: "var(--accent)", textDecoration: "none",
                      border: "1px solid var(--accent)", padding: "2px 8px",
                    }}
                  >
                    ▶ YT
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
