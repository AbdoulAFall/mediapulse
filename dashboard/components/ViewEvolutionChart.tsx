"use client";
import { useState } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend, BarChart, Bar, Cell,
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

type Mode = "cumul" | "delta";

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : String(n);
}

function fmtDelta(n: number) {
  return (n >= 0 ? "+" : "") + fmt(Math.abs(n));
}

function channelColor(name: string, idx: number): string {
  return CHANNEL_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

// ── Construction des données pour le mode CUMULÉ ────────────────────────────
function buildCumulData(evolutions: MatinaleEvolution[]) {
  const timesSet = new Set<string>();
  for (const ev of evolutions) {
    for (const snap of ev.snapshots) timesSet.add(snap.time);
  }
  const times = Array.from(timesSet).sort();

  return times.map((t) => {
    const point: Record<string, string | number | null> = { time: t };
    for (const ev of evolutions) {
      const snap = ev.snapshots.find((s) => s.time === t);
      point[ev.channel] = snap?.view_count ?? null;
    }
    return point;
  });
}

// ── Construction des données pour le mode DELTA ──────────────────────────────
// Pour chaque tranche de 15 min, on calcule les vues gagnées par chaîne.
// Si c'est le 1er snapshot d'une chaîne, delta = null (pas de référence avant).
function buildDeltaData(evolutions: MatinaleEvolution[]) {
  const timesSet = new Set<string>();
  for (const ev of evolutions) {
    for (const snap of ev.snapshots) timesSet.add(snap.time);
  }
  const times = Array.from(timesSet).sort();

  return times.map((t, tIdx) => {
    const point: Record<string, string | number | null> = { time: t };
    for (const ev of evolutions) {
      const snapIdx = ev.snapshots.findIndex((s) => s.time === t);
      if (snapIdx <= 0) {
        // Premier snapshot ou absent → pas de delta
        point[ev.channel] = null;
      } else {
        const curr = ev.snapshots[snapIdx].view_count;
        const prev = ev.snapshots[snapIdx - 1].view_count;
        point[ev.channel] = curr != null && prev != null ? curr - prev : null;
      }
    }
    return point;
  });
}

interface Props {
  evolutions: MatinaleEvolution[];
  date?: string;
}

// ── Tooltip commun (mode cumulé ou delta) ────────────────────────────────────
function CustomTooltip({ active, payload, label, mode }: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
  label?: string;
  mode: Mode;
}) {
  if (!active || !payload?.length) return null;
  const visible = payload.filter((p) => p.value != null);
  const sorted  = [...visible].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--ink)",
      padding: "10px 14px", fontSize: 12, minWidth: 170,
    }}>
      <p style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{label}</p>
      {sorted.map((p) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <span style={{
            display: "inline-block", width: 8, height: 8,
            borderRadius: "50%", background: p.color, flexShrink: 0,
          }} />
          <span style={{ color: "var(--text-muted)" }}>{p.name}</span>
          <span style={{
            fontWeight: 700, marginLeft: "auto",
            color: mode === "delta" && (p.value ?? 0) > 0 ? "#2e7d32" : "var(--ink)",
          }}>
            {mode === "delta" ? fmtDelta(p.value ?? 0) : fmt(p.value ?? 0)}
          </span>
        </div>
      ))}
      {mode === "delta" && (
        <p style={{ color: "var(--text-muted)", fontSize: 10, marginTop: 6, borderTop: "1px solid var(--border)", paddingTop: 4 }}>
          Vues gagnées sur cette tranche
        </p>
      )}
    </div>
  );
}

// ── Toggle bouton ─────────────────────────────────────────────────────────────
function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="flex" style={{ border: "1px solid var(--border)" }}>
      {([
        { key: "cumul",  label: "Cumulé" },
        { key: "delta",  label: "Activité" },
      ] as { key: Mode; label: string }[]).map(({ key, label }) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className="px-3 py-1 text-xs font-semibold transition-all"
          style={{
            background: mode === key ? "var(--ink)" : "transparent",
            color:      mode === key ? "white"      : "var(--text-muted)",
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────────────────────
export default function ViewEvolutionChart({ evolutions, date }: Props) {
  const [mode, setMode] = useState<Mode>("cumul");

  if (!evolutions || evolutions.length === 0) {
    return (
      <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="px-5 pt-4 pb-3" style={{ borderBottom: "2px solid var(--ink)" }}>
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Évolution J0</p>
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

  const isToday  = !date || date === new Date().toISOString().slice(0, 10);
  const maxSnaps = Math.max(...evolutions.map((e) => e.snapshots.length));
  const data     = mode === "cumul" ? buildCumulData(evolutions) : buildDeltaData(evolutions);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>

      {/* ── Header ── */}
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: "2px solid var(--ink)" }}>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Évolution J0</p>
            <h2 className="font-display font-bold mt-0.5" style={{ fontSize: 18, color: "var(--ink)" }}>
              {mode === "cumul" ? "Vues cumulées" : "Activité par tranche 15 min"}
              {" · "}{date ?? new Date().toISOString().slice(0, 10)}
            </h2>
          </div>
          <div className="flex items-center gap-3 mt-1 flex-shrink-0">
            <ModeToggle mode={mode} onChange={setMode} />
            {isToday && (
              <span className="text-xs font-semibold px-2 py-1"
                style={{ background: "var(--accent)", color: "white", letterSpacing: "0.05em" }}>
                ● LIVE
              </span>
            )}
            <a href="/evolution"
              className="text-xs font-bold uppercase tracking-widest hover:opacity-70 transition-opacity"
              style={{ color: "var(--text-muted)", letterSpacing: "0.12em", textDecoration: "none" }}>
              Détail →
            </a>
          </div>
        </div>
        <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
          {evolutions.length} matinale{evolutions.length > 1 ? "s" : ""}
          {" · "}{maxSnaps} mesure{maxSnaps > 1 ? "s" : ""}
          {" · "}
          {mode === "cumul"
            ? "Total de vues depuis la mise en ligne"
            : "Vues gagnées par tranche de 15 min — révèle les pics d'audience"}
        </p>
      </div>

      {/* ── Graphique ── */}
      <div className="px-5 pt-5 pb-2">
        {mode === "cumul" ? (
          // Courbes cumulées
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                axisLine={false} tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                axisLine={false} tickLine={false} width={48}
              />
              <Tooltip content={<CustomTooltip mode="cumul" />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
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
        ) : (
          // Barres de delta (activité)
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data} margin={{ top: 8, right: 20, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis
                dataKey="time"
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                axisLine={false} tickLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tickFormatter={fmt}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                axisLine={false} tickLine={false} width={48}
              />
              <Tooltip content={<CustomTooltip mode="delta" />} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
              {evolutions.map((ev, idx) => (
                <Bar
                  key={ev.matinale_id}
                  dataKey={ev.channel}
                  fill={channelColor(ev.channel, idx)}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={20}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Légende delta ── */}
      {mode === "delta" && (
        <div className="px-5 pb-3">
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            💡 Les pics correspondent aux moments où la vidéo est partagée ou mise en avant par YouTube.
          </p>
        </div>
      )}

      {/* ── Panneau détail par chaîne ── */}
      <div className="px-5 pb-5">
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Détail</p>
          <div className="flex flex-col gap-2">
            {evolutions.map((ev, idx) => {
              const last   = ev.snapshots[ev.snapshots.length - 1];
              const first  = ev.snapshots[0];
              const growth = last && first && first.view_count != null && last.view_count != null
                ? last.view_count - first.view_count
                : null;
              return (
                <div key={ev.matinale_id} className="flex items-center gap-3">
                  <span style={{
                    display: "inline-block", width: 10, height: 10,
                    borderRadius: "50%", background: channelColor(ev.channel, idx), flexShrink: 0,
                  }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                      {ev.channel}
                    </span>
                    {ev.title && (
                      <span className="text-xs ml-2" style={{ color: "var(--text-muted)" }}>
                        {ev.title.length > 55 ? ev.title.slice(0, 55) + "…" : ev.title}
                      </span>
                    )}
                  </div>
                  {/* Total actuel */}
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    {last?.view_count != null && (
                      <span className="text-xs font-bold" style={{ color: "var(--ink)" }}>
                        {fmt(last.view_count)}
                      </span>
                    )}
                    {growth != null && growth > 0 && (
                      <span className="text-xs font-semibold px-1"
                        style={{ background: "#e8f5e9", color: "#2e7d32" }}>
                        +{fmt(growth)}
                      </span>
                    )}
                  </div>
                  <a
                    href={`https://www.youtube.com/watch?v=${ev.youtube_video_id}`}
                    target="_blank" rel="noopener noreferrer"
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
