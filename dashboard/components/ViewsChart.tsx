"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList,
} from "recharts";
import { ChannelStats } from "@/lib/api";
import { channelColor } from "@/lib/colors";

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)}k`
    : String(n);
}

export default function ViewsChart({ channels }: { channels: ChannelStats[] }) {
  const hasViews = channels.some((c) => c.total_views > 0);
  const dataKey  = hasViews ? "total_views" : "matinales_count";
  const label    = hasViews ? "Vues totales" : "Matinales";

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 pt-4 pb-3" style={{ borderBottom: "2px solid var(--ink)" }}>
        <p className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Audience
        </p>
        <h2 className="font-display font-bold mt-0.5" style={{ fontSize: 18, color: "var(--ink)" }}>
          {hasViews ? "Vues totales par chaîne" : "Matinales par chaîne"}
        </h2>
      </div>

      <div className="p-5">
        {!hasViews && (
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Les vues seront disponibles après la prochaine synchronisation.
          </p>
        )}
        <ResponsiveContainer width="100%" height={Math.max(260, channels.length * 40)}>
          <BarChart
            data={channels}
            layout="vertical"
            margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
          >
            <XAxis
              type="number"
              tickFormatter={fmt}
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={120}
              tick={{ fill: "var(--ink)", fontSize: 11, fontWeight: 600 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--ink)", borderRadius: 0, fontSize: 12 }}
              labelStyle={{ color: "var(--ink)", fontWeight: 700 }}
              formatter={(v: number) => [fmt(v), label]}
              cursor={{ fill: "var(--surface2)" }}
            />
            <Bar dataKey={dataKey} radius={0} maxBarSize={26}>
              {channels.map((c, i) => (
                <Cell key={i} fill={channelColor(c.name, i)} />
              ))}
              <LabelList
                dataKey={dataKey}
                position="right"
                formatter={(v: number) => fmt(v)}
                style={{ fill: "var(--text-muted)", fontSize: 11, fontWeight: 600 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
