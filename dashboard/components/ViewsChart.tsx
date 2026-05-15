"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
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

export default function ViewsChart({ channels }: { channels: ChannelStats[] }) {
  const hasViews = channels.some((c) => c.total_views > 0);
  const data = hasViews ? channels : channels;
  const dataKey = hasViews ? "total_views" : "matinales_count";
  const label   = hasViews ? "Vues totales" : "Matinales";

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {/* Titre section style presse */}
      <div className="px-5 pt-4 pb-3"
        style={{ borderBottom: "2px solid var(--ink)" }}>
        <p className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Audience
        </p>
        <h2 className="font-display font-bold mt-0.5"
          style={{ fontSize: 18, color: "var(--ink)" }}>
          {hasViews ? "Vues totales par chaîne" : "Matinales par chaîne"}
        </h2>
      </div>

      <div className="p-5">
        {!hasViews && (
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Les vues seront disponibles après la prochaine synchronisation.
          </p>
        )}
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
            <XAxis dataKey="name"
              tick={{ fill: "var(--text-muted)", fontSize: 10, fontWeight: 600 }}
              axisLine={{ stroke: "var(--border)" }} tickLine={false} />
            <YAxis tickFormatter={fmt}
              tick={{ fill: "var(--text-muted)", fontSize: 10 }}
              axisLine={false} tickLine={false} width={42} />
            <Tooltip
              contentStyle={{ background: "var(--surface)", border: "1px solid var(--ink)", borderRadius: 0, fontSize: 12 }}
              labelStyle={{ color: "var(--ink)", fontWeight: 700 }}
              formatter={(v: number) => [fmt(v), label]}
              cursor={{ fill: "var(--surface2)" }}
            />
            <Bar dataKey={dataKey} radius={0} maxBarSize={40}>
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
