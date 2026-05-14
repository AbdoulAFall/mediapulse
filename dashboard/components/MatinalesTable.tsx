"use client";
import { Matinale } from "@/lib/api";

function fmt(n: number | null) {
  if (!n) return "—";
  return n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${(n / 1_000).toFixed(0)}k` : String(n);
}

export default function MatinalesTable({ matinales }: { matinales: Matinale[] }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }} className="rounded-xl overflow-hidden">
      <div className="p-5 border-b" style={{ borderColor: "var(--border)" }}>
        <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Détail des matinales
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: "var(--surface2)", color: "var(--text-muted)" }}>
              {["Date", "Chaîne", "Émission", "Début", "Fin", "Durée", "Vues", "Likes", ""].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-xs uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {matinales.map((m, i) => (
              <tr key={m.id}
                style={{ borderTop: "1px solid var(--border)", background: i % 2 === 0 ? "transparent" : "var(--surface2)" }}
                className="hover:opacity-80 transition-opacity">
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                  {new Date(m.published_at).toLocaleDateString("fr-FR")}
                </td>
                <td className="px-4 py-3 font-medium">{m.channel}</td>
                <td className="px-4 py-3 max-w-xs truncate" style={{ color: "var(--text-muted)" }} title={m.title ?? ""}>
                  {m.title ?? "—"}
                </td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{m.debut ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap font-mono text-xs">{m.fin ?? "—"}</td>
                <td className="px-4 py-3 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>{m.duree ?? "—"}</td>
                <td className="px-4 py-3 font-semibold" style={{ color: "#6366f1" }}>{fmt(m.view_count)}</td>
                <td className="px-4 py-3" style={{ color: "var(--text-muted)" }}>{fmt(m.like_count)}</td>
                <td className="px-4 py-3">
                  <a href={m.youtube_url} target="_blank" rel="noopener noreferrer"
                    style={{ color: "#6366f1" }} className="hover:underline text-xs">▶ YouTube</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
