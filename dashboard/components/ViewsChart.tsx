"use client";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, Legend,
} from "recharts";
import { ChannelStats } from "@/lib/api";

const COLORS = [
  "#6366f1","#8b5cf6","#ec4899","#f59e0b","#22c55e",
  "#14b8a6","#3b82f6","#f97316","#a855f7","#ef4444",
];

function fmt(n: number) {
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)}k`
    : String(n);
}

export default function ViewsChart({ channels }: { channels: ChannelStats[] }) {
  const hasViews = channels.some((c) => c.total_views > 0);

  if (!hasViews) {
    return (
      <div
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
        className="rounded-xl p-5 mb-6 flex flex-col"
      >
        <h2
          className="text-sm font-semibold uppercase tracking-wider mb-4"
          style={{ color: "var(--text-muted)" }}
        >
          Vues totales par chaîne
        </h2>

        {/* Affiche le nombre de matinales même sans vues */}
        <div className="flex-1 flex flex-col justify-center">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart
              data={channels}
              margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            >
              <XAxis
                dataKey="name"
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "var(--text-muted)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={30}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--surface2)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                }}
                labelStyle={{ color: "var(--text)" }}
                formatter={(v: number) => [v, "Matinales"]}
              />
              <Bar dataKey="matinales_count" radius={[6, 6, 0, 0]} name="Matinales">
                {channels.map((_, i) => (
                  <Cell key={i} fill={COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <p className="text-center text-xs mt-2" style={{ color: "var(--text-muted)" }}>
            Nombre de matinales — vues disponibles après synchronisation
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      className="rounded-xl p-5 mb-6"
    >
      <h2
        className="text-sm font-semibold uppercase tracking-wider mb-4"
        style={{ color: "var(--text-muted)" }}
      >
        Vues totales par chaîne
      </h2>
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={channels} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
          <XAxis
            dataKey="name"
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tickFormatter={fmt}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            width={45}
          />
          <Tooltip
            contentStyle={{
              background: "var(--surface2)",
              border: "1px solid var(--border)",
              borderRadius: 8,
            }}
            labelStyle={{ color: "var(--text)" }}
            formatter={(v: number, name: string) => [
              fmt(v),
              name === "total_views" ? "Vues totales" : "Vues moy./épisode",
            ]}
          />
          <Legend
            wrapperStyle={{ color: "var(--text-muted)", fontSize: 11 }}
            formatter={(value) =>
              value === "total_views" ? "Vues totales" : "Vues moy./épisode"
            }
          />
          <Bar dataKey="total_views" radius={[4, 4, 0, 0]} name="total_views">
            {channels.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
