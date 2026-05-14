"use client";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#22c55e","#14b8a6","#3b82f6","#f97316","#a855f7","#ef4444"];

function fmt(n: number) {
  return n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n);
}

export default function TimelineChart({ data }: { data: Record<string, number | string>[] }) {
  if (!data.length) return null;
  const channels = Object.keys(data[0]).filter(k => k !== "date");

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }} className="rounded-xl p-5 mb-6">
      <h2 className="text-sm font-semibold uppercase tracking-wider mb-4" style={{ color: "var(--text-muted)" }}>
        Évolution des vues par jour
      </h2>
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <defs>
            {channels.map((ch, i) => (
              <linearGradient key={ch} id={`grad-${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0.3} />
                <stop offset="95%" stopColor={COLORS[i % COLORS.length]} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>
          <XAxis dataKey="date" tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} />
          <YAxis tickFormatter={fmt} tick={{ fill: "var(--text-muted)", fontSize: 10 }} axisLine={false} tickLine={false} width={40} />
          <Tooltip
            contentStyle={{ background: "var(--surface2)", border: "1px solid var(--border)", borderRadius: 8 }}
            labelStyle={{ color: "var(--text)", fontWeight: 600 }}
            formatter={(v: number, name: string) => [fmt(v), name]}
          />
          <Legend wrapperStyle={{ color: "var(--text-muted)", fontSize: 11 }} />
          {channels.map((ch, i) => (
            <Area key={ch} type="monotone" dataKey={ch}
              stroke={COLORS[i % COLORS.length]} fill={`url(#grad-${i})`} strokeWidth={2} dot={false} />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
