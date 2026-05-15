"use client";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";

const COLORS = [
  "#6366f1","#ec4899","#f59e0b","#22c55e","#14b8a6",
  "#3b82f6","#f97316","#a855f7","#ef4444","#8b5cf6",
];

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)}k`
    : String(n);
}

function fmtDate(d: string) {
  // "2026-05-08" → "08/05"
  const parts = d.split("-");
  return `${parts[2]}/${parts[1]}`;
}

export default function TimelineChart({
  data,
}: {
  data: Record<string, number | string>[];
}) {
  if (!data.length) return null;

  const channels = Object.keys(data[0]).filter((k) => k !== "date");
  const hasViews = data.some((d) =>
    channels.some((ch) => (d[ch] as number) > 0)
  );

  if (!hasViews) {
    return (
      <div
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        className="rounded-xl p-5 mb-6 flex flex-col items-center justify-center"
        style2={{ minHeight: 320 }}
      >
        <p className="text-3xl mb-3">📊</p>
        <p className="font-medium" style={{ color: "var(--text-muted)" }}>
          Évolution des vues par jour
        </p>
        <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
          Les vues seront disponibles après la prochaine synchronisation.
        </p>
      </div>
    );
  }

  // Réduire le nombre de ticks sur l'axe X pour éviter le chevauchement
  const tickInterval = Math.max(1, Math.floor(data.length / 8));

  return (
    <div
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      className="rounded-xl p-5 mb-6"
    >
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: "var(--text-muted)" }}
      >
        Évolution des vues par jour
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="date"
            tickFormatter={fmtDate}
            interval={tickInterval}
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fill: "var(--text-muted)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={40}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelFormatter={fmtDate}
            labelStyle={{ color: "var(--text)", fontWeight: 600, marginBottom: 4 }}
            formatter={(v: number, name: string) => [fmt(v), name]}
          />
          <Legend
            wrapperStyle={{ color: "var(--text-muted)", fontSize: 10, paddingTop: 8 }}
            iconType="circle"
            iconSize={6}
          />
          {channels.map((ch, i) => (
            <Line
              key={ch}
              type="monotone"
              dataKey={ch}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
