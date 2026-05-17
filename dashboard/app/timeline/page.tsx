"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import PeriodSelector, { Period, periodToParams } from "@/components/PeriodSelector";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, ResponsiveContainer,
} from "recharts";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Couleurs ──────────────────────────────────────────────────────────────────
const CHANNEL_COLORS: Record<string, string> = {
  "TFM":         "#d0021b",
  "RTS":         "#1a1714",
  "2STV":        "#c0392b",
  "Sen TV":      "#4a4440",
  "Walf TV":     "#7a736a",
  "Solution TV": "#8b0000",
};
const FALLBACK_COLORS = ["#333", "#666", "#999", "#bbb", "#e53e3e", "#a30016"];

function channelColor(name: string, idx: number) {
  return CHANNEL_COLORS[name] ?? FALLBACK_COLORS[idx % FALLBACK_COLORS.length];
}

// ── Périodes ──────────────────────────────────────────────────────────────────
const PERIODS = [
  { label: "7 j",    value: 7   },
  { label: "30 j",   value: 30  },
  { label: "60 j",   value: 60  },
  { label: "6 mois", value: 180 },
  { label: "1 an",   value: 365 },
  { label: "2 ans",  value: 730 },
];

// ── Formatage ─────────────────────────────────────────────────────────────────
function fmt(n: number | null) {
  if (n == null || n === 0) return "—";
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : String(n);
}
function fmtRaw(n: number | null) {
  if (n == null || n === 0) return "—";
  return n.toLocaleString("fr-FR");
}
function fmtDelta(n: number | null) {
  if (n == null) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + fmt(Math.abs(n));
}
function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}
function fmtDateLong(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", {
    weekday: "short", day: "numeric", month: "short",
  });
}

type Row = Record<string, number | string>;
type Mode = "cumul" | "delta";

// ── Tooltip graphique ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, mode, channels, allData }: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
  label?: string;
  mode: Mode;
  channels: string[];
  allData: Row[];
}) {
  if (!active || !payload?.length || !label) return null;

  const sorted = [...payload]
    .filter((p) => p.value != null && p.value > 0)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

  // Pour le mode delta, calcule le delta depuis le jour précédent
  const rowIdx = allData.findIndex((r) => r.date === label);
  const prevRow = rowIdx > 0 ? allData[rowIdx - 1] : null;

  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--ink)",
      padding: "10px 14px", fontSize: 12, minWidth: 200,
    }}>
      <p style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>
        {fmtDateLong(label)}
      </p>
      {sorted.map((p) => {
        const delta = mode === "cumul" && prevRow
          ? (p.value ?? 0) - ((prevRow[p.name] as number) ?? 0)
          : null;
        return (
          <div key={p.name} className="flex items-center gap-2 mb-1">
            <span style={{
              display: "inline-block", width: 8, height: 8,
              borderRadius: "50%", background: p.color, flexShrink: 0,
            }} />
            <span style={{ color: "var(--text-muted)" }}>{p.name}</span>
            <span style={{ fontWeight: 700, marginLeft: "auto", color: "var(--ink)" }}>
              {fmt(p.value)}
            </span>
            {delta != null && delta !== 0 && (
              <span style={{ fontSize: 10, color: delta > 0 ? "#2e7d32" : "#c62828", fontWeight: 600 }}>
                {delta > 0 ? "+" : ""}{fmt(delta)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
export default function TimelinePage() {
  const [period, setPeriod]     = useState<Period>({ days: 60, year: null });
  const [mode, setMode]         = useState<Mode>("cumul");
  const [selected, setSelected] = useState<string[]>([]);
  const [showTable, setShowTable] = useState(false);

  const { data, isLoading } = useSWR<Row[]>(
    `${API_URL}/api/timeline?${periodToParams(period)}`,
    (url: string) => fetch(url).then((r) => r.json()),
    { dedupingInterval: 5 * 60 * 1000, revalidateOnFocus: false }
  );

  // Extrait les chaînes disponibles
  const allChannels = data && data.length > 0
    ? Object.keys(data[0]).filter((k) => k !== "date")
    : [];

  // Init/sync sélection quand les données arrivent ou changent de période
  useEffect(() => {
    if (allChannels.length === 0) return;
    setSelected((prev) => {
      // Garde les chaînes déjà sélectionnées qui existent dans les nouvelles données
      const valid = prev.filter((ch) => allChannels.includes(ch));
      // Si aucune chaîne valide (premier chargement), tout sélectionner
      return valid.length > 0 ? valid : allChannels;
    });
  }, [allChannels.join(",")]);

  function toggleChannel(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  // Filtre les données sur les chaînes sélectionnées
  const filtered = (data ?? []).map((row) => {
    const r: Row = { date: row.date };
    for (const ch of selected) r[ch] = row[ch] ?? 0;
    return r;
  });

  const tickInterval = Math.max(1, Math.floor((filtered.length) / 10));
  const isComparison = selected.length === 2;

  // Stats globales
  const lastRow = filtered[filtered.length - 1];
  const firstRow = filtered[0];
  const totalLastDay = lastRow
    ? selected.reduce((s, ch) => s + ((lastRow[ch] as number) ?? 0), 0)
    : 0;
  const avgPerDay = filtered.length > 0
    ? Math.round(
        filtered.reduce((s, r) => s + selected.reduce((ss, ch) => ss + ((r[ch] as number) ?? 0), 0), 0)
        / filtered.length
      )
    : 0;

  // Meilleur jour (total toutes chaînes sélectionnées)
  const bestRow = filtered.reduce((best, r) => {
    const total = selected.reduce((s, ch) => s + ((r[ch] as number) ?? 0), 0);
    const bestTotal = selected.reduce((s, ch) => s + ((best?.[ch] as number) ?? 0), 0);
    return total > bestTotal ? r : best;
  }, filtered[0]);

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div style={{ background: "var(--accent)", height: 4 }} />

      {/* ── Header ── */}
      <header style={{ background: "var(--surface)", borderBottom: "2px solid var(--ink)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-end justify-between">
          <div>
            <h1 className="font-display font-bold leading-none tracking-tight"
              style={{ fontSize: 36, color: "var(--ink)", fontWeight: 900 }}>
              MEDIAPULSE
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest mt-1"
              style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}>
              Évolution · Vues par jour
            </p>
          </div>
          <a href="/dashboard" className="text-xs font-semibold"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}>
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* ── Contrôles ── */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-5 py-4 flex flex-wrap items-center gap-4">

            {/* Période */}
            <PeriodSelector value={period} onChange={(p) => { setPeriod(p); }} />

            <div style={{ width: 1, height: 20, background: "var(--border)" }} />

            {/* Chaînes */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Chaînes</span>
              <button
                onClick={() => setSelected(
                  selected.length === allChannels.length ? [] : allChannels
                )}
                className="text-xs font-semibold px-2 py-1"
                style={{
                  background: selected.length === allChannels.length ? "var(--ink)" : "transparent",
                  color:      selected.length === allChannels.length ? "white" : "var(--text-muted)",
                  border: "1px solid var(--border)",
                }}>
                {selected.length === allChannels.length ? "Tout désélectionner" : "Toutes"}
              </button>
              {allChannels.map((ch, idx) => {
                const active = selected.includes(ch);
                return (
                  <button key={ch} onClick={() => toggleChannel(ch)}
                    className="text-xs font-semibold px-2 py-1 transition-all"
                    style={{
                      background:  active ? channelColor(ch, idx) : "transparent",
                      color:       active ? "white" : "var(--text-muted)",
                      border:      `1px solid ${active ? channelColor(ch, idx) : "var(--border)"}`,
                    }}>
                    {ch}
                  </button>
                );
              })}
            </div>

            <div style={{ width: 1, height: 20, background: "var(--border)" }} />

            {/* Mode */}
            <div className="flex" style={{ border: "1px solid var(--border)" }}>
              {(["cumul", "delta"] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className="px-3 py-1 text-xs font-semibold"
                  style={{
                    background: mode === m ? "var(--ink)" : "transparent",
                    color:      mode === m ? "white"      : "var(--text-muted)",
                  }}>
                  {m === "cumul" ? "Vues J" : "Variation"}
                </button>
              ))}
            </div>

            {isComparison && (
              <span className="text-xs font-bold px-2 py-1"
                style={{ background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9" }}>
                ⇄ Comparaison {selected[0]} vs {selected[1]}
              </span>
            )}
          </div>
        </div>

        {/* ── Bandeau stats ── */}
        {!isLoading && filtered.length > 0 && (
          <div className="grid gap-px"
            style={{
              gridTemplateColumns: `repeat(${Math.min(3 + selected.length, 7)}, 1fr)`,
              background: "var(--border)", border: "1px solid var(--border)",
            }}>
            <div className="px-5 py-3" style={{ background: "var(--surface)" }}>
              <p className="text-xs uppercase font-bold tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Jours</p>
              <p className="font-bold mt-1" style={{ fontSize: 22, color: "var(--ink)" }}>
                {filtered.length}
              </p>
            </div>
            <div className="px-5 py-3" style={{ background: "var(--surface)" }}>
              <p className="text-xs uppercase font-bold tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Moy./jour</p>
              <p className="font-bold mt-1" style={{ fontSize: 22, color: "var(--ink)" }}>
                {fmt(avgPerDay)}
              </p>
            </div>
            <div className="px-5 py-3" style={{ background: "var(--surface)" }}>
              <p className="text-xs uppercase font-bold tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Meilleur jour</p>
              <p className="font-bold mt-1" style={{ fontSize: 16, color: "var(--ink)" }}>
                {bestRow ? fmtDate(bestRow.date as string) : "—"}
              </p>
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                {bestRow ? fmt(selected.reduce((s, ch) => s + ((bestRow[ch] as number) ?? 0), 0)) : "—"}
              </p>
            </div>
            {selected.map((ch, idx) => {
              const last  = lastRow?.[ch]  as number | null ?? null;
              const first = firstRow?.[ch] as number | null ?? null;
              const trend = last != null && first != null && first > 0
                ? Math.round(((last - first) / first) * 100) : null;
              return (
                <div key={ch} className="px-5 py-3" style={{ background: "var(--surface)" }}>
                  <p className="text-xs font-bold"
                    style={{ color: channelColor(ch, idx), letterSpacing: "0.08em" }}>
                    {ch}
                  </p>
                  <p className="font-bold mt-1" style={{ fontSize: 20, color: "var(--ink)" }}>
                    {fmt(last)}
                  </p>
                  {trend != null && (
                    <p className="text-xs font-semibold"
                      style={{ color: trend >= 0 ? "#2e7d32" : "#c62828" }}>
                      {trend >= 0 ? "+" : ""}{trend}% vs début période
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Graphique principal ── */}
        {isLoading && (
          <div className="px-5 py-16 text-center text-xs"
            style={{ color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)" }}>
            Chargement…
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 pt-4 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
                {mode === "cumul" ? "Vues par jour" : "Variation jour / jour"}
                {" · "}{days} derniers jours
              </p>
            </div>
            <div className="px-4 py-6">
              {mode === "cumul" ? (
                <ResponsiveContainer width="100%" height={400}>
                  <LineChart data={filtered} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} interval={tickInterval}
                      tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmt}
                      tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={
                      <ChartTooltip mode="cumul" channels={selected} allData={filtered} />
                    } />
                    <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    {selected.map((ch, idx) => (
                      <Line key={ch} type="monotone" dataKey={ch}
                        stroke={channelColor(ch, idx)} strokeWidth={2}
                        dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                // Mode variation : delta jour/jour
                <ResponsiveContainer width="100%" height={400}>
                  <BarChart
                    data={filtered.map((row, i) => {
                      const r: Row = { date: row.date };
                      const prev = i > 0 ? filtered[i - 1] : null;
                      for (const ch of selected) {
                        const curr = (row[ch] as number) ?? 0;
                        const p    = prev ? ((prev[ch] as number) ?? 0) : 0;
                        r[ch] = curr - p;
                      }
                      return r;
                    })}
                    margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="date" tickFormatter={fmtDate} interval={tickInterval}
                      tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={fmt}
                      tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} width={52} />
                    <Tooltip
                      contentStyle={{ background: "var(--surface)", border: "1px solid var(--ink)", fontSize: 12 }}
                      labelFormatter={fmtDateLong}
                      formatter={(v: number, name: string) => [fmtDelta(v), name]}
                    />
                    <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    {selected.map((ch, idx) => (
                      <Bar key={ch} dataKey={ch}
                        fill={channelColor(ch, idx)}
                        radius={[2, 2, 0, 0]} maxBarSize={selected.length > 3 ? 8 : 16} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ── Tableau comparatif (2 chaînes) ── */}
        {!isLoading && isComparison && filtered.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "2px solid var(--ink)" }}>
              <p className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Comparaison directe</p>
              <h2 className="font-display font-bold mt-0.5"
                style={{ fontSize: 18, color: "var(--ink)" }}>
                {selected[0]} vs {selected[1]}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                    <th className="px-4 py-2.5 text-left font-bold uppercase"
                      style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>Date</th>
                    <th className="px-4 py-2.5 text-left font-bold"
                      style={{ color: channelColor(selected[0], 0) }}>{selected[0]}</th>
                    <th className="px-4 py-2.5 text-left font-bold"
                      style={{ color: channelColor(selected[0], 0) }}>Δ J-1</th>
                    <th className="px-4 py-2.5 text-left font-bold"
                      style={{ color: channelColor(selected[1], 1) }}>{selected[1]}</th>
                    <th className="px-4 py-2.5 text-left font-bold"
                      style={{ color: channelColor(selected[1], 1) }}>Δ J-1</th>
                    <th className="px-4 py-2.5 text-left font-bold uppercase"
                      style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                      Écart
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[...filtered].reverse().map((row, i, arr) => {
                    const prev = arr[i + 1];
                    const vA = (row[selected[0]] as number) ?? 0;
                    const vB = (row[selected[1]] as number) ?? 0;
                    const dA = prev ? vA - ((prev[selected[0]] as number) ?? 0) : null;
                    const dB = prev ? vB - ((prev[selected[1]] as number) ?? 0) : null;
                    const ecart = vA - vB;
                    const aLeads = ecart > 0;
                    return (
                      <tr key={row.date as string}
                        style={{
                          borderBottom: "1px solid var(--border)",
                          background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                        }}>
                        <td className="px-4 py-2 font-mono font-semibold"
                          style={{ color: "var(--ink)" }}>
                          {fmtDateLong(row.date as string)}
                        </td>
                        <td className="px-4 py-2 font-mono font-bold"
                          style={{ color: vA > vB ? channelColor(selected[0], 0) : "var(--ink)" }}>
                          {fmt(vA || null)}
                        </td>
                        <td className="px-4 py-2 font-mono"
                          style={{ color: dA != null && dA > 0 ? "#2e7d32" : dA != null && dA < 0 ? "#c62828" : "var(--text-muted)" }}>
                          {dA != null ? fmtDelta(dA) : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono font-bold"
                          style={{ color: vB > vA ? channelColor(selected[1], 1) : "var(--ink)" }}>
                          {fmt(vB || null)}
                        </td>
                        <td className="px-4 py-2 font-mono"
                          style={{ color: dB != null && dB > 0 ? "#2e7d32" : dB != null && dB < 0 ? "#c62828" : "var(--text-muted)" }}>
                          {dB != null ? fmtDelta(dB) : "—"}
                        </td>
                        <td className="px-4 py-2 font-mono font-bold">
                          {vA === 0 && vB === 0 ? "—" : (
                            <span style={{ color: aLeads ? channelColor(selected[0], 0) : channelColor(selected[1], 1) }}>
                              {ecart > 0 ? "+" : ""}{fmtRaw(ecart)} {aLeads ? `▲ ${selected[0]}` : `▲ ${selected[1]}`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Tableau complet (toutes chaînes) ── */}
        {!isLoading && filtered.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 py-4 flex items-center justify-between"
              style={{ borderBottom: "2px solid var(--ink)" }}>
              <div>
                <p className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Données brutes</p>
                <h2 className="font-display font-bold mt-0.5"
                  style={{ fontSize: 18, color: "var(--ink)" }}>
                  Vues par jour · toutes chaînes
                </h2>
              </div>
              <button onClick={() => setShowTable((v) => !v)}
                className="text-xs font-bold uppercase tracking-wider px-4 py-2"
                style={{ border: "1px solid var(--ink)", color: "var(--ink)" }}>
                {showTable ? "Masquer" : "Afficher le tableau"}
              </button>
            </div>

            {showTable && (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                      <th className="px-4 py-2.5 text-left font-bold uppercase"
                        style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>Date</th>
                      {selected.map((ch, idx) => (
                        <th key={ch} className="px-4 py-2.5 text-left font-bold"
                          style={{ color: channelColor(ch, idx) }}>{ch}</th>
                      ))}
                      <th className="px-4 py-2.5 text-left font-bold uppercase"
                        style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...filtered].reverse().map((row, i) => {
                      const total = selected.reduce((s, ch) => s + ((row[ch] as number) ?? 0), 0);
                      const isBest = bestRow && row.date === bestRow.date;
                      return (
                        <tr key={row.date as string}
                          style={{
                            borderBottom: "1px solid var(--border)",
                            background: isBest
                              ? "#f1f8f1"
                              : i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                          }}>
                          <td className="px-4 py-2 font-mono font-semibold"
                            style={{ color: "var(--ink)", whiteSpace: "nowrap" }}>
                            <span>{fmtDateLong(row.date as string)}</span>
                            {isBest && (
                              <span className="ml-2 text-xs font-bold"
                                style={{ color: "#2e7d32" }}>★ Meilleur</span>
                            )}
                          </td>
                          {selected.map((ch, idx) => (
                            <td key={ch} className="px-4 py-2 font-mono"
                              style={{ color: (row[ch] as number) > 0 ? "var(--ink)" : "var(--text-muted)" }}>
                              {fmt((row[ch] as number) || null)}
                            </td>
                          ))}
                          <td className="px-4 py-2 font-mono font-bold"
                            style={{ color: "var(--ink)" }}>
                            {fmt(total || null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 mt-4"
        style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          MediaPulse · Données YouTube · Sync automatique lun–ven (UTC)
        </p>
      </footer>
    </div>
  );
}
