"use client";
import { useState, useEffect } from "react";
import useSWR from "swr";
import {
  LineChart, Line, BarChart, Bar,
  XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, ResponsiveContainer,
} from "recharts";
import { MatinaleEvolution, ViewSnapshot } from "@/lib/api";
import { channelColor } from "@/lib/colors";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Formatage ─────────────────────────────────────────────────────────────────
function fmt(n: number | null) {
  if (n == null) return "—";
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : String(n);
}
function fmtRaw(n: number | null) {
  if (n == null) return "—";
  return n.toLocaleString("fr-FR");
}
function fmtDelta(n: number | null) {
  if (n == null) return "—";
  const sign = n >= 0 ? "+" : "";
  return sign + fmt(Math.abs(n));
}

// ── Construction données graphique ────────────────────────────────────────────
function buildCumulData(evs: MatinaleEvolution[]) {
  const times = Array.from(
    new Set(evs.flatMap((e) => e.snapshots.map((s) => s.time)))
  ).sort();
  return times.map((t) => {
    const pt: Record<string, string | number | null> = { time: t };
    for (const ev of evs) {
      const snap = ev.snapshots.find((s) => s.time === t);
      pt[ev.channel] = snap?.view_count ?? null;
    }
    return pt;
  });
}

function buildDeltaData(evs: MatinaleEvolution[]) {
  const times = Array.from(
    new Set(evs.flatMap((e) => e.snapshots.map((s) => s.time)))
  ).sort();
  return times.map((t) => {
    const pt: Record<string, string | number | null> = { time: t };
    for (const ev of evs) {
      const idx = ev.snapshots.findIndex((s) => s.time === t);
      if (idx <= 0) { pt[ev.channel] = null; continue; }
      const curr = ev.snapshots[idx].view_count;
      const prev = ev.snapshots[idx - 1].view_count;
      pt[ev.channel] = curr != null && prev != null ? curr - prev : null;
    }
    return pt;
  });
}

// ── Tooltip graphique ─────────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label, mode }: {
  active?: boolean;
  payload?: { name: string; value: number | null; color: string }[];
  label?: string;
  mode: "cumul" | "delta";
}) {
  if (!active || !payload?.length) return null;
  const sorted = [...payload].filter((p) => p.value != null)
    .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--ink)",
      padding: "10px 14px", fontSize: 12, minWidth: 180,
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
            color: mode === "delta" ? "#2e7d32" : "var(--ink)",
          }}>
            {mode === "delta" ? fmtDelta(p.value) : fmt(p.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Tableau détaillé d'une matinale ───────────────────────────────────────────
function SnapshotTable({ snapshots, color }: {
  snapshots: ViewSnapshot[];
  color: string;
}) {
  // Calcule les deltas
  const rows = snapshots.map((s, i) => {
    const prev = i > 0 ? snapshots[i - 1] : null;
    return {
      ...s,
      delta_views:    prev?.view_count    != null && s.view_count    != null ? s.view_count    - prev.view_count    : null,
      delta_likes:    prev?.like_count    != null && s.like_count    != null ? s.like_count    - prev.like_count    : null,
      delta_comments: prev?.comment_count != null && s.comment_count != null ? s.comment_count - prev.comment_count : null,
    };
  });

  const totalGrowth = snapshots.length > 1
    ? (snapshots[snapshots.length - 1].view_count ?? 0) - (snapshots[0].view_count ?? 0)
    : null;

  const peakRow = rows.reduce((best, r) =>
    (r.delta_views ?? 0) > (best?.delta_views ?? 0) ? r : best,
    rows[0]
  );

  return (
    <div>
      {/* Mini stats */}
      <div className="flex gap-6 px-4 py-2 text-xs" style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
        <span style={{ color: "var(--text-muted)" }}>
          <span style={{ fontWeight: 700, color: "var(--ink)" }}>{snapshots.length}</span> mesures
        </span>
        {totalGrowth != null && (
          <span style={{ color: "var(--text-muted)" }}>
            Croissance totale :{" "}
            <span style={{ fontWeight: 700, color: "#2e7d32" }}>+{fmt(totalGrowth)}</span> vues
          </span>
        )}
        {peakRow?.delta_views != null && peakRow.delta_views > 0 && (
          <span style={{ color: "var(--text-muted)" }}>
            Pic à <span style={{ fontWeight: 700, color: "var(--ink)" }}>{peakRow.time}</span>{" "}
            (<span style={{ color: "#2e7d32", fontWeight: 700 }}>+{fmt(peakRow.delta_views)}</span> en 15 min)
          </span>
        )}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
              {["Heure", "Vues", "+Δ Vues", "Likes", "+Δ Likes", "Commentaires"].map((h) => (
                <th key={h} className="px-4 py-2 text-left font-bold uppercase"
                  style={{ color: "var(--text-muted)", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const isPeak = r.time === peakRow?.time && (r.delta_views ?? 0) > 0;
              return (
                <tr key={i}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background: isPeak
                      ? "#f1f8f1"
                      : i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                  }}>
                  {/* Heure */}
                  <td className="px-4 py-2 font-mono font-bold" style={{ color: "var(--ink)" }}>
                    <div className="flex items-center gap-2">
                      {isPeak && (
                        <span style={{
                          width: 6, height: 6, borderRadius: "50%",
                          background: color, display: "inline-block", flexShrink: 0,
                        }} />
                      )}
                      {r.time}
                      {isPeak && (
                        <span className="font-semibold" style={{ color: "#2e7d32", fontSize: 10 }}>PIC</span>
                      )}
                    </div>
                  </td>
                  {/* Vues */}
                  <td className="px-4 py-2 font-mono font-bold" style={{ color: "var(--ink)" }}>
                    {fmtRaw(r.view_count)}
                  </td>
                  {/* Δ Vues */}
                  <td className="px-4 py-2 font-mono font-semibold"
                    style={{ color: r.delta_views != null && r.delta_views > 0 ? "#2e7d32" : "var(--text-muted)" }}>
                    {i === 0 ? "—" : fmtDelta(r.delta_views)}
                  </td>
                  {/* Likes */}
                  <td className="px-4 py-2 font-mono" style={{ color: "var(--text-muted)" }}>
                    {fmtRaw(r.like_count)}
                  </td>
                  {/* Δ Likes */}
                  <td className="px-4 py-2 font-mono"
                    style={{ color: r.delta_likes != null && r.delta_likes > 0 ? "#2e7d32" : "var(--text-muted)" }}>
                    {i === 0 ? "—" : fmtDelta(r.delta_likes)}
                  </td>
                  {/* Commentaires */}
                  <td className="px-4 py-2 font-mono" style={{ color: "var(--text-muted)" }}>
                    {fmtRaw(r.comment_count)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Ligne de synthèse */}
          <tfoot>
            <tr style={{ borderTop: "2px solid var(--ink)", background: "var(--surface2)" }}>
              <td className="px-4 py-2 font-bold text-xs uppercase"
                style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>
                Dernier snapshot
              </td>
              <td className="px-4 py-2 font-mono font-bold" style={{ color: "var(--ink)" }}>
                {fmtRaw(snapshots[snapshots.length - 1]?.view_count)}
              </td>
              <td className="px-4 py-2 font-mono font-semibold"
                style={{ color: "#2e7d32" }}>
                {totalGrowth != null ? `+${fmtRaw(totalGrowth)}` : "—"}
              </td>
              <td className="px-4 py-2 font-mono" style={{ color: "var(--text-muted)" }}>
                {fmtRaw(snapshots[snapshots.length - 1]?.like_count)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ── Tableau comparatif (2 chaînes côte à côte) ────────────────────────────────
function ComparisonTable({ a, b, colorA, colorB }: {
  a: MatinaleEvolution;
  b: MatinaleEvolution;
  colorA: string;
  colorB: string;
}) {
  const times = Array.from(
    new Set([...a.snapshots.map((s) => s.time), ...b.snapshots.map((s) => s.time)])
  ).sort();

  function delta(ev: MatinaleEvolution, time: string) {
    const idx = ev.snapshots.findIndex((s) => s.time === time);
    if (idx <= 0) return null;
    const curr = ev.snapshots[idx].view_count;
    const prev = ev.snapshots[idx - 1].view_count;
    return curr != null && prev != null ? curr - prev : null;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
            <th className="px-4 py-2.5 text-left font-bold uppercase"
              style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>Heure</th>
            <th className="px-4 py-2.5 text-left font-bold" style={{ color: colorA }}>{a.channel} — Vues</th>
            <th className="px-4 py-2.5 text-left font-bold" style={{ color: colorA }}>+Δ</th>
            <th className="px-4 py-2.5 text-left font-bold" style={{ color: colorB }}>{b.channel} — Vues</th>
            <th className="px-4 py-2.5 text-left font-bold" style={{ color: colorB }}>+Δ</th>
            <th className="px-4 py-2.5 text-left font-bold uppercase"
              style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>
              Écart ({a.channel} vs {b.channel})
            </th>
          </tr>
        </thead>
        <tbody>
          {times.map((t, i) => {
            const snapA = a.snapshots.find((s) => s.time === t);
            const snapB = b.snapshots.find((s) => s.time === t);
            const dA = delta(a, t);
            const dB = delta(b, t);
            const ecart = snapA?.view_count != null && snapB?.view_count != null
              ? snapA.view_count - snapB.view_count
              : null;
            const aLeads = ecart != null && ecart > 0;
            const bLeads = ecart != null && ecart < 0;

            return (
              <tr key={t} style={{
                borderBottom: "1px solid var(--border)",
                background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
              }}>
                <td className="px-4 py-2 font-mono font-bold" style={{ color: "var(--ink)" }}>{t}</td>
                <td className="px-4 py-2 font-mono font-bold" style={{ color: snapA ? "var(--ink)" : "var(--text-muted)" }}>
                  {fmtRaw(snapA?.view_count ?? null)}
                </td>
                <td className="px-4 py-2 font-mono" style={{ color: dA != null && dA > 0 ? "#2e7d32" : "var(--text-muted)" }}>
                  {i === 0 ? "—" : fmtDelta(dA)}
                </td>
                <td className="px-4 py-2 font-mono font-bold" style={{ color: snapB ? "var(--ink)" : "var(--text-muted)" }}>
                  {fmtRaw(snapB?.view_count ?? null)}
                </td>
                <td className="px-4 py-2 font-mono" style={{ color: dB != null && dB > 0 ? "#2e7d32" : "var(--text-muted)" }}>
                  {i === 0 ? "—" : fmtDelta(dB)}
                </td>
                <td className="px-4 py-2 font-mono font-bold">
                  {ecart == null ? "—" : (
                    <span style={{ color: aLeads ? colorA : bLeads ? colorB : "var(--text-muted)" }}>
                      {ecart > 0 ? "+" : ""}{fmtRaw(ecart)}{" "}
                      {aLeads ? `▲ ${a.channel}` : bLeads ? `▲ ${b.channel}` : "="}
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr style={{ borderTop: "2px solid var(--ink)", background: "var(--surface2)" }}>
            <td className="px-4 py-2 font-bold text-xs uppercase"
              style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>Final</td>
            <td className="px-4 py-2 font-mono font-bold" style={{ color: colorA }}>
              {fmtRaw(a.snapshots[a.snapshots.length - 1]?.view_count ?? null)}
            </td>
            <td colSpan={2} className="px-4 py-2 font-mono font-bold" style={{ color: colorB }}>
              {fmtRaw(b.snapshots[b.snapshots.length - 1]?.view_count ?? null)}
            </td>
            <td colSpan={2} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────────
type Mode = "cumul" | "delta";

export default function EvolutionPage() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate]           = useState(today);
  const [mode, setMode]           = useState<Mode>("cumul");
  const [selected, setSelected]   = useState<string[]>([]);   // chaînes actives
  const [expanded, setExpanded]   = useState<Record<number, boolean>>({});

  const { data, isLoading } = useSWR<MatinaleEvolution[]>(
    `${API_URL}/api/views/evolution?date=${date}`,
    (url: string) => fetch(url).then((r) => r.json()),
    { refreshInterval: date === today ? 2 * 60 * 1000 : 0, revalidateOnFocus: false }
  );

  // Init sélection quand les données arrivent
  useEffect(() => {
    if (data && selected.length === 0) {
      setSelected(data.map((e) => e.channel));
    }
  }, [data]);

  // Réinitialise la sélection quand on change de date
  useEffect(() => { setSelected([]); }, [date]);

  const visible = (data ?? []).filter((e) => selected.includes(e.channel));

  function toggleChannel(name: string) {
    setSelected((prev) =>
      prev.includes(name) ? prev.filter((c) => c !== name) : [...prev, name]
    );
  }

  function toggleExpanded(id: number) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  // Stats globales sur les chaînes visibles
  const totalSnapshots = visible.reduce((s, e) => s + e.snapshots.length, 0);
  const totalViews     = visible.reduce((s, e) => {
    const last = e.snapshots[e.snapshots.length - 1];
    return s + (last?.view_count ?? 0);
  }, 0);
  const totalGrowth    = visible.reduce((s, e) => {
    if (e.snapshots.length < 2) return s;
    const first = e.snapshots[0].view_count ?? 0;
    const last  = (e.snapshots[e.snapshots.length - 1].view_count ?? 0);
    return s + (last - first);
  }, 0);

  const chartData = mode === "cumul" ? buildCumulData(visible) : buildDeltaData(visible);
  const isComparison = visible.length === 2;
  const isToday = date === today;

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
              Évolution des vues · Snapshots 15 min
            </p>
          </div>
          <a href="/dashboard" className="text-xs font-semibold"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}>
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 flex flex-col gap-6">

        {/* ── Barre de contrôles ── */}
        <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <div className="px-5 py-4 flex flex-wrap items-center gap-4">

            {/* Date */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Date</span>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value)}
                style={{
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--ink)", fontFamily: "inherit", fontSize: 12,
                  padding: "6px 8px", outline: "none",
                }}
              />
              {isToday && (
                <span className="text-xs font-semibold px-2 py-1"
                  style={{ background: "var(--accent)", color: "white" }}>
                  ● LIVE
                </span>
              )}
            </div>

            <div style={{ width: 1, height: 20, background: "var(--border)" }} />

            {/* Chaînes */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Chaînes</span>
              {(data ?? []).map((ev, idx) => {
                const active = selected.includes(ev.channel);
                return (
                  <button key={ev.channel} onClick={() => toggleChannel(ev.channel)}
                    className="text-xs font-semibold px-2 py-1 transition-all"
                    style={{
                      background:  active ? channelColor(ev.channel, idx) : "transparent",
                      color:       active ? "white" : "var(--text-muted)",
                      border:      `1px solid ${channelColor(ev.channel, idx)}`,
                    }}>
                    {ev.channel}
                  </button>
                );
              })}
            </div>

            <div style={{ width: 1, height: 20, background: "var(--border)" }} />

            {/* Mode graphique */}
            <div className="flex" style={{ border: "1px solid var(--border)" }}>
              {(["cumul", "delta"] as Mode[]).map((m) => (
                <button key={m} onClick={() => setMode(m)}
                  className="px-3 py-1 text-xs font-semibold"
                  style={{
                    background: mode === m ? "var(--ink)" : "transparent",
                    color:      mode === m ? "white"      : "var(--text-muted)",
                  }}>
                  {m === "cumul" ? "Cumulé" : "Activité"}
                </button>
              ))}
            </div>

            {isComparison && (
              <span className="text-xs font-bold px-2 py-1"
                style={{ background: "#e3f2fd", color: "#1565c0", border: "1px solid #90caf9" }}>
                ⇄ Mode comparaison actif
              </span>
            )}
          </div>
        </div>

        {/* ── Bandeau stats ── */}
        {!isLoading && visible.length > 0 && (
          <div className="grid gap-px" style={{
            gridTemplateColumns: `repeat(${Math.min(visible.length + 2, 6)}, 1fr)`,
            background: "var(--border)",
            border: "1px solid var(--border)",
          }}>
            <div className="px-5 py-3" style={{ background: "var(--surface)" }}>
              <p className="text-xs uppercase font-bold tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Mesures</p>
              <p className="font-bold mt-1" style={{ fontSize: 22, color: "var(--ink)" }}>
                {totalSnapshots}
              </p>
            </div>
            <div className="px-5 py-3" style={{ background: "var(--surface)" }}>
              <p className="text-xs uppercase font-bold tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Vues totales</p>
              <p className="font-bold mt-1" style={{ fontSize: 22, color: "var(--ink)" }}>
                {fmt(totalViews)}
              </p>
            </div>
            <div className="px-5 py-3" style={{ background: "var(--surface)" }}>
              <p className="text-xs uppercase font-bold tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Croissance J</p>
              <p className="font-bold mt-1" style={{ fontSize: 22, color: "#2e7d32" }}>
                +{fmt(totalGrowth)}
              </p>
            </div>
            {visible.map((ev, idx) => {
              const last  = ev.snapshots[ev.snapshots.length - 1];
              const first = ev.snapshots[0];
              const growth = last && first && last.view_count != null && first.view_count != null
                ? last.view_count - first.view_count : null;
              return (
                <div key={ev.matinale_id} className="px-5 py-3" style={{ background: "var(--surface)" }}>
                  <p className="text-xs font-bold"
                    style={{ color: channelColor(ev.channel, idx), letterSpacing: "0.08em" }}>
                    {ev.channel}
                  </p>
                  <p className="font-bold mt-1" style={{ fontSize: 20, color: "var(--ink)" }}>
                    {fmt(last?.view_count ?? null)}
                  </p>
                  {growth != null && growth > 0 && (
                    <p className="text-xs font-semibold" style={{ color: "#2e7d32" }}>
                      +{fmt(growth)} aujourd'hui
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Graphique ── */}
        {isLoading && (
          <div className="px-5 py-12 text-center text-xs"
            style={{ color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)" }}>
            Chargement…
          </div>
        )}

        {!isLoading && visible.length === 0 && data?.length === 0 && (
          <div className="px-5 py-12 text-center text-sm"
            style={{ color: "var(--text-muted)", background: "var(--surface)", border: "1px solid var(--border)" }}>
            Aucun snapshot disponible pour cette date.
          </div>
        )}

        {!isLoading && visible.length > 0 && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 pt-4 pb-2" style={{ borderBottom: "1px solid var(--border)" }}>
              <p className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
                {mode === "cumul" ? "Vues cumulées" : "Activité par tranche 15 min"}
              </p>
            </div>
            <div className="px-4 py-5">
              {mode === "cumul" ? (
                <ResponsiveContainer width="100%" height={340}>
                  <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={fmt} tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<ChartTooltip mode="cumul" />} />
                    <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    {visible.map((ev, idx) => (
                      <Line key={ev.matinale_id} type="monotone" dataKey={ev.channel}
                        stroke={channelColor(ev.channel, idx)} strokeWidth={2.5}
                        dot={{ r: 3, fill: channelColor(ev.channel, idx) }}
                        activeDot={{ r: 6 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <ResponsiveContainer width="100%" height={340}>
                  <BarChart data={chartData} margin={{ top: 8, right: 24, bottom: 0, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="time" tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis tickFormatter={fmt} tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                      axisLine={false} tickLine={false} width={52} />
                    <Tooltip content={<ChartTooltip mode="delta" />} />
                    <Legend iconType="circle" iconSize={8}
                      wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                    {visible.map((ev, idx) => (
                      <Bar key={ev.matinale_id} dataKey={ev.channel}
                        fill={channelColor(ev.channel, idx)}
                        radius={[2, 2, 0, 0]} maxBarSize={24} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        )}

        {/* ── Tableau comparatif (exactement 2 chaînes) ── */}
        {!isLoading && isComparison && (
          <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="px-5 py-4" style={{ borderBottom: "2px solid var(--ink)" }}>
              <p className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Comparaison</p>
              <h2 className="font-display font-bold mt-0.5" style={{ fontSize: 18, color: "var(--ink)" }}>
                {visible[0].channel} vs {visible[1].channel}
              </h2>
            </div>
            <ComparisonTable
              a={visible[0]} b={visible[1]}
              colorA={channelColor(visible[0].channel, 0)}
              colorB={channelColor(visible[1].channel, 1)}
            />
          </div>
        )}

        {/* ── Tableaux détaillés par matinale ── */}
        {!isLoading && visible.length > 0 && (
          <div className="flex flex-col gap-4">
            <p className="text-xs font-bold uppercase tracking-widest px-1"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
              Détail par matinale
            </p>
            {visible.map((ev, idx) => {
              const color = channelColor(ev.channel, idx);
              const isOpen = expanded[ev.matinale_id] !== false; // ouvert par défaut
              const last = ev.snapshots[ev.snapshots.length - 1];
              return (
                <div key={ev.matinale_id}
                  style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>

                  {/* En-tête matinale */}
                  <div className="px-5 py-4 flex items-center justify-between cursor-pointer"
                    style={{ borderBottom: isOpen ? "2px solid var(--ink)" : "none" }}
                    onClick={() => toggleExpanded(ev.matinale_id)}>
                    <div className="flex items-center gap-3 min-w-0">
                      <span style={{
                        display: "inline-block", width: 12, height: 12,
                        borderRadius: "50%", background: color, flexShrink: 0,
                      }} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm" style={{ color: "var(--ink)" }}>
                            {ev.channel}
                          </span>
                          {last?.view_count != null && (
                            <span className="text-xs font-bold px-2 py-0.5"
                              style={{ background: "var(--ink)", color: "white" }}>
                              {fmt(last.view_count)} vues
                            </span>
                          )}
                        </div>
                        {ev.title && (
                          <p className="text-xs mt-0.5 truncate"
                            style={{ color: "var(--text-muted)", maxWidth: 500 }}>
                            {ev.title}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <a href={`https://www.youtube.com/watch?v=${ev.youtube_video_id}`}
                        target="_blank" rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-bold px-3 py-1"
                        style={{
                          color: "var(--accent)", border: "1px solid var(--accent)",
                          textDecoration: "none",
                        }}>
                        ▶ YouTube
                      </a>
                      <span className="text-xs font-semibold"
                        style={{ color: "var(--text-muted)" }}>
                        {isOpen ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {/* Tableau snapshots */}
                  {isOpen && (
                    <SnapshotTable snapshots={ev.snapshots} color={color} />
                  )}
                </div>
              );
            })}
          </div>
        )}

      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 mt-4"
        style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          MediaPulse · Snapshots toutes les 15 min · 6h–12h UTC (lun–ven)
        </p>
      </footer>
    </div>
  );
}
