"use client";
import { useState } from "react";
import { Matinale } from "@/lib/api";

type SortKey = "published_at" | "view_count" | "like_count" | "duration_seconds";

function fmt(n: number | null) {
  if (!n) return "—";
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${(n / 1_000).toFixed(0)}k`
    : String(n);
}

const HEADERS: { key: SortKey | null; label: string }[] = [
  { key: "published_at", label: "Date" },
  { key: null, label: "Chaîne" },
  { key: null, label: "Émission" },
  { key: null, label: "Début" },
  { key: null, label: "Fin" },
  { key: "duration_seconds", label: "Durée" },
  { key: "view_count", label: "Vues" },
  { key: "like_count", label: "Likes" },
  { key: null, label: "" },
];

export default function MatinalesTable({ matinales }: { matinales: Matinale[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  const sorted = [...matinales].sort((a, b) => {
    let va: number, vb: number;
    if (sortKey === "published_at") {
      va = new Date(a.published_at).getTime();
      vb = new Date(b.published_at).getTime();
    } else {
      va = (a[sortKey] as number | null) ?? 0;
      vb = (b[sortKey] as number | null) ?? 0;
    }
    return sortDir === "asc" ? va - vb : vb - va;
  });

  return (
    <div
      style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      className="rounded-xl overflow-hidden"
    >
      {/* Header */}
      <div
        className="px-5 py-4 flex items-center justify-between border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <h2
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: "var(--text-muted)" }}
        >
          Détail des matinales
        </h2>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: "var(--surface2)", color: "var(--text-muted)" }}
        >
          {matinales.length} épisode{matinales.length > 1 ? "s" : ""}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              {HEADERS.map(({ key, label }) => (
                <th
                  key={label}
                  className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider select-none"
                  style={{ cursor: key ? "pointer" : "default" }}
                  onClick={() => key && toggleSort(key)}
                >
                  {label}
                  {key && sortKey === key && (
                    <span className="ml-1">{sortDir === "desc" ? "↓" : "↑"}</span>
                  )}
                  {key && sortKey !== key && (
                    <span className="ml-1 opacity-30">↕</span>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((m, i) => (
              <tr
                key={m.id}
                style={{
                  borderTop: "1px solid var(--border)",
                  background: i % 2 === 0 ? "transparent" : "var(--surface2)",
                }}
                className="hover:opacity-80 transition-opacity"
              >
                <td
                  className="px-4 py-3 whitespace-nowrap text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {new Date(m.published_at).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "2-digit",
                    year: "numeric",
                  })}
                </td>
                <td className="px-4 py-3 font-semibold whitespace-nowrap">
                  {m.channel}
                </td>
                <td
                  className="px-4 py-3 max-w-xs truncate"
                  style={{ color: "var(--text-muted)" }}
                  title={m.title ?? ""}
                >
                  {m.title ?? "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                  {m.debut ?? "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">
                  {m.fin ?? "—"}
                </td>
                <td
                  className="px-4 py-3 whitespace-nowrap text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {m.duree ?? "—"}
                </td>
                <td
                  className="px-4 py-3 font-semibold"
                  style={{ color: m.view_count ? "var(--accent)" : "var(--text-muted)" }}
                >
                  {fmt(m.view_count)}
                </td>
                <td
                  className="px-4 py-3 text-xs"
                  style={{ color: "var(--text-muted)" }}
                >
                  {fmt(m.like_count)}
                </td>
                <td className="px-4 py-3">
                  <a
                    href={m.youtube_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-md transition-colors hover:opacity-80"
                    style={{ background: "#1e1128", color: "#c084fc" }}
                  >
                    ▶ YouTube
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
