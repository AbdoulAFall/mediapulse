"use client";
import { useState } from "react";
import { Matinale } from "@/lib/api";

const REASONS = [
  "Mauvaise vidéo",
  "Doublon",
  "Pas une matinale",
  "Titre incorrect",
  "Autre",
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Props {
  matinale: Matinale;
  onClose: () => void;
}

export default function ReportModal({ matinale, onClose }: Props) {
  const [reason,  setReason]  = useState(REASONS[0]);
  const [comment, setComment] = useState("");
  const [status,  setStatus]  = useState<"idle" | "loading" | "success" | "error">("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    try {
      const res = await fetch(`${API_URL}/api/matinales/${matinale.id}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, comment: comment || null }),
      });
      if (!res.ok) throw new Error();
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(26,23,20,0.6)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-md"
        style={{ background: "var(--surface)", border: "2px solid var(--ink)" }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-start justify-between"
          style={{ borderBottom: "2px solid var(--ink)" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--accent)", letterSpacing: "0.15em" }}>
              Signaler un problème
            </p>
            <h3 className="font-display font-bold mt-0.5" style={{ fontSize: 16, color: "var(--ink)" }}>
              {matinale.channel} · {new Date(matinale.published_at).toLocaleDateString("fr-FR")}
            </h3>
            <p className="text-xs mt-1 truncate" style={{ color: "var(--text-muted)", maxWidth: 320 }}>
              {matinale.title ?? "—"}
            </p>
          </div>
          <button onClick={onClose}
            className="text-lg font-bold ml-4 leading-none"
            style={{ color: "var(--text-muted)" }}>
            ✕
          </button>
        </div>

        {/* Corps */}
        {status === "success" ? (
          <div className="px-5 py-8 text-center">
            <p className="text-2xl mb-3">✅</p>
            <p className="font-bold" style={{ color: "var(--ink)" }}>Signalement envoyé</p>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Notre équipe va examiner ce contenu. Merci !
            </p>
            <button onClick={onClose}
              className="mt-5 px-6 py-2 text-xs font-bold uppercase tracking-wider"
              style={{ background: "var(--ink)", color: "white" }}>
              Fermer
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="px-5 py-5 flex flex-col gap-4">

            {/* Raison */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>
                Raison *
              </label>
              <div className="flex flex-col gap-1.5">
                {REASONS.map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="reason"
                      value={r}
                      checked={reason === r}
                      onChange={() => setReason(r)}
                      style={{ accentColor: "var(--accent)" }}
                    />
                    <span className="text-sm" style={{ color: "var(--ink)" }}>{r}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Commentaire */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-2"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>
                Commentaire (optionnel)
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Ex : La bonne vidéo est celle intitulée..."
                className="w-full text-sm p-2 resize-none outline-none"
                style={{
                  border: "1px solid var(--border)", background: "var(--bg)",
                  color: "var(--ink)", fontFamily: "inherit",
                }}
              />
            </div>

            {status === "error" && (
              <p className="text-xs" style={{ color: "var(--accent)" }}>
                ⚠ Une erreur est survenue. Réessaie dans un instant.
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider flex-1"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                Annuler
              </button>
              <button type="submit" disabled={status === "loading"}
                className="px-4 py-2 text-xs font-bold uppercase tracking-wider flex-1"
                style={{
                  background: status === "loading" ? "var(--text-muted)" : "var(--accent)",
                  color: "white",
                }}>
                {status === "loading" ? "Envoi…" : "Envoyer le signalement"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
