"use client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = ["#d0021b","#1a1714","#7a736a","#c0392b","#2c2c2c",
                 "#a30016","#4a4440","#8b0000","#555","#e53e3e"];

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)}k`
    : String(n);
}

function fmtDate(d: string) {
  const [, m, day] = d.split("-");
  return `${day}/${m}`;
}

export default function TimelineChart({
  data,
}: {
  data: Record<string, number | string>[];
}) {
  if (!data.length) return null;

  // Extrait toutes les chaînes présentes dans N'IMPORTE QUELLE ligne (pas seulement la première)
  const channels = Array.from(
    new Set(data.flatMap((row) => Object.keys(row).filter((k) => k !== "date")))
  );
  const hasViews = data.some((d) => channels.some((ch) => (d[ch] as number) > 0));
  const tickInterval = Math.max(1, Math.floor(data.length / 8));

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 pt-4 pb-3 flex items-start justify-between"
        style={{ borderBottom: "2px solid var(--ink)" }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            Évolution
          </p>
          <h2 className="font-display font-bold mt-0.5"
            style={{ fontSize: 18, color: "var(--ink)" }}>
            Vues par jour
          </h2>
        </div>
        <a href="/timeline"
          className="text-xs font-bold uppercase tracking-widest hover:opacity-70 transition-opacity mt-1"
          style={{ color: "var(--text-muted)", letterSpacing: "0.12em", textDecoration: "none", flexShrink: 0 }}>
          Détail →
        </a>
      </div>

      <div className="p-5">
        {!hasViews ? (
          <div className="flex items-center justify-center"
            style={{ height: 240, color: "var(--text-muted)" }}>
            <p className="text-sm">Données de vues disponibles après synchronisation.</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tickFormatter={fmtDate} interval={tickInterval}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                axisLine={{ stroke: "var(--border)" }} tickLine={false} />
              <YAxis tickFormatter={fmt}
                tick={{ fill: "var(--text-muted)", fontSize: 10 }}
                axisLine={false} tickLine={false} width={40} />
              <Tooltip
                contentStyle={{ background: "var(--surface)", border: "1px solid var(--ink)", borderRadius: 0, fontSize: 12 }}
                labelFormatter={fmtDate}
                labelStyle={{ color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}
                formatter={(v: number, name: string) => [fmt(v), name]}
              />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 8 }} iconType="plainline" iconSize={16} />
              {channels.map((ch, i) => (
                <Line key={ch} type="monotone" dataKey={ch}
                  stroke={COLORS[i % COLORS.length]}
                  strokeWidth={i === 0 ? 2.5 : 1.5}
                  dot={false} activeDot={{ r: 3, strokeWidth: 0 }} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
