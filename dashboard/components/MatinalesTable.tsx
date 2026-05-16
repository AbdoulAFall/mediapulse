"use client";
import { useState } from "react";
import { Matinale } from "@/lib/api";
import ReportModal from "@/components/ReportModal";

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
  { key: "published_at",    label: "Date"     },
  { key: null,              label: "Chaîne"   },
  { key: null,              label: "Émission" },
  { key: null,              label: "Début"    },
  { key: null,              label: "Fin"      },
  { key: "duration_seconds",label: "Durée"    },
  { key: "view_count",      label: "Vues"     },
  { key: "like_count",      label: "Likes"    },
  { key: null,              label: ""         },
];

export default function MatinalesTable({ matinales }: { matinales: Matinale[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("published_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [reporting, setReporting] = useState<Matinale | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  }

  const sorted = [...matinales].sort((a, b) => {
    const va = sortKey === "published_at"
      ? new Date(a.published_at).getTime()
      : ((a[sortKey] as number | null) ?? 0);
    const vb = sortKey === "published_at"
      ? new Date(b.published_at).getTime()
      : ((b[sortKey] as number | null) ?? 0);
    return sortDir === "asc" ? (va as number) - (vb as number) : (vb as number) - (va as number);
  });

  return (
    <>
      <div style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
        {/* En-tête section */}
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ borderBottom: "2px solid var(--ink)" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
              Résultats
            </p>
            <h2 className="font-display font-bold mt-0.5"
              style={{ fontSize: 18, color: "var(--ink)" }}>
              Détail des matinales
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <a
              href="/matinales"
              className="text-xs font-bold uppercase tracking-widest hover:opacity-70 transition-opacity"
              style={{ color: "var(--text-muted)", letterSpacing: "0.12em", textDecoration: "none" }}
            >
              Toutes les matinales →
            </a>
            <span className="text-sm font-bold px-3 py-1"
              style={{ background: "var(--ink)", color: "white" }}>
              {matinales.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                {HEADERS.map(({ key, label }) => (
                  <th key={label}
                    onClick={() => key && toggleSort(key)}
                    className="px-4 py-2.5 text-left text-xs font-bold uppercase"
                    style={{
                      color:         "var(--text-muted)",
                      letterSpacing: "0.1em",
                      cursor:        key ? "pointer" : "default",
                      userSelect:    "none",
                      whiteSpace:    "nowrap",
                    }}>
                    {label}
                    {key && (
                      <span className="ml-1" style={{ opacity: sortKey === key ? 1 : 0.3 }}>
                        {sortKey === key ? (sortDir === "desc" ? "↓" : "↑") : "↕"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((m, i) => (
                <tr key={m.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background:   i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                  }}
                  className="hover:opacity-75 transition-opacity">
                  <td className="px-4 py-3 whitespace-nowrap text-xs font-mono"
                    style={{ color: "var(--text-muted)" }}>
                    {new Date(m.published_at).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-bold px-2 py-0.5"
                      style={{ background: "var(--ink)", color: "white" }}>
                      {m.channel}
                    </span>
                  </td>
                  <td className="px-4 py-3 max-w-xs truncate text-xs"
                    style={{ color: "var(--text-muted)" }} title={m.title ?? ""}>
                    {m.title ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-semibold">
                    {m.debut ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-mono text-xs"
                    style={{ color: "var(--text-muted)" }}>
                    {m.fin ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs"
                    style={{ color: "var(--text-muted)" }}>
                    {m.duree ?? "—"}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap font-bold text-sm"
                    style={{ color: m.view_count ? "var(--accent)" : "var(--text-muted)" }}>
                    {fmt(m.view_count)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs"
                    style={{ color: "var(--text-muted)" }}>
                    {fmt(m.like_count)}
                  </td>
                  {/* Actions */}
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      <a href={m.youtube_url} target="_blank" rel="noopener noreferrer"
                        className="text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-70"
                        style={{ color: "var(--accent)", textDecoration: "none", letterSpacing: "0.05em" }}>
                        ▶ voir
                      </a>
                      <button
                        onClick={() => setReporting(m)}
                        className="text-xs font-semibold uppercase tracking-wider transition-opacity hover:opacity-70"
                        style={{ color: "var(--text-muted)", letterSpacing: "0.05em" }}
                        title="Signaler un problème avec cette vidéo"
                      >
                        ⚑ signaler
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal signalement */}
      {reporting && (
        <ReportModal matinale={reporting} onClose={() => setReporting(null)} />
      )}
    </>
  );
}
