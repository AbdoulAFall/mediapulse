"use client";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { ChannelStats } from "@/lib/api";

const COLORS = ["#d0021b","#1a1714","#7a736a","#c0392b","#2c2c2c",
                "#a30016","#4a4440","#8b0000","#555","#333"];

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)}k`
    : String(n);
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { percent: number } }[] }) {
  if (!active || !payload?.length) return null;
  const { name, value, payload: p } = payload[0];
  return (
    <div style={{
      background: "var(--surface)", border: "1px solid var(--ink)",
      padding: "8px 12px", fontSize: 12,
    }}>
      <p style={{ color: "var(--ink)", fontWeight: 700, marginBottom: 2 }}>{name}</p>
      <p style={{ color: "var(--text-muted)" }}>{fmt(value)} vues</p>
      <p style={{ color: "var(--accent)", fontWeight: 600 }}>{(p.percent * 100).toFixed(1)}%</p>
    </div>
  );
}

function CustomLabel({ cx, cy, midAngle, innerRadius, outerRadius, percent }: {
  cx: number; cy: number; midAngle: number;
  innerRadius: number; outerRadius: number; percent: number;
}) {
  if (percent < 0.05) return null; // cache les petites tranches
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 0.5;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);
  return (
    <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central"
      style={{ fontSize: 11, fontWeight: 700 }}>
      {`${(percent * 100).toFixed(0)}%`}
    </text>
  );
}

export default function ShareChart({ channels }: { channels: ChannelStats[] }) {
  const data = channels
    .filter((c) => c.total_views > 0)
    .map((c) => ({ name: c.name, value: c.total_views }))
    .sort((a, b) => b.value - a.value);

  if (!data.length) return null;

  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 pt-4 pb-3 flex items-start justify-between"
        style={{ borderBottom: "2px solid var(--ink)" }}>
        <div>
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            Audience
          </p>
          <h2 className="font-display font-bold mt-0.5"
            style={{ fontSize: 18, color: "var(--ink)" }}>
            Part de vues par chaîne
          </h2>
        </div>
        <p className="text-xs font-bold mt-1" style={{ color: "var(--text-muted)" }}>
          Total : <span style={{ color: "var(--ink)" }}>{fmt(total)}</span>
        </p>
      </div>

      <div className="p-5">
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={65}
              outerRadius={105}
              paddingAngle={2}
              dataKey="value"
              labelLine={false}
              label={CustomLabel as (props: unknown) => JSX.Element | null}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="none" />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11, paddingTop: 8 }}
              formatter={(value: string) => (
                <span style={{ color: "var(--text-muted)" }}>{value}</span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
