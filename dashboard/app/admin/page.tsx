"use client";
import { useState, useEffect, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

interface Report {
  id: number;
  reason: string;
  comment: string | null;
  status: string;
  created_at: string;
  matinale_id: number;
  title: string | null;
  youtube_video_id: string;
  published_at: string;
  channel: string;
}

interface AdminMatinale {
  id: number;
  youtube_video_id: string;
  title: string | null;
  published_at: string;
  duration_seconds: number | null;
  channel: string;
  channel_db_id: number;
  pending_reports: number;
}

interface ExcludedDay {
  id: number;
  date: string;
  reason: string | null;
  created_at: string;
}

interface Channel {
  id: number;
  name: string;
}

type Tab = "reports" | "matinales" | "excluded";

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (!n) return "—";
  return n >= 3600 ? `${Math.floor(n / 3600)}h${String(Math.floor((n % 3600) / 60)).padStart(2, "0")}m` : `${Math.floor(n / 60)}m`;
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function authHeaders(token: string) {
  return { "Content-Type": "application/json", "X-Admin-Token": token };
}

// ── Sous-composants ────────────────────────────────────────────────────────

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="text-xs font-bold px-1.5 py-0.5 ml-1"
      style={{ background: "var(--accent)", color: "white" }}>
      {n}
    </span>
  );
}

function ActionBtn({
  label, onClick, danger, disabled,
}: { label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      className="text-xs font-semibold px-2 py-1 transition-opacity hover:opacity-70 disabled:opacity-40"
      style={{
        border: `1px solid ${danger ? "var(--accent)" : "var(--border)"}`,
        color:  danger ? "var(--accent)" : "var(--text-muted)",
      }}>
      {label}
    </button>
  );
}

// ── Modale générique ───────────────────────────────────────────────────────

function Modal({ title, subtitle, onClose, children }: {
  title: string; subtitle?: string; onClose: () => void; children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(26,23,20,0.65)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-md" style={{ background: "var(--surface)", border: "2px solid var(--ink)" }}>
        <div className="px-5 py-4 flex items-start justify-between" style={{ borderBottom: "2px solid var(--ink)" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--accent)", letterSpacing: "0.15em" }}>
              Admin
            </p>
            <h3 className="font-display font-bold mt-0.5" style={{ fontSize: 16, color: "var(--ink)" }}>{title}</h3>
            {subtitle && <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>{subtitle}</p>}
          </div>
          <button onClick={onClose} className="text-lg font-bold ml-4 leading-none" style={{ color: "var(--text-muted)" }}>✕</button>
        </div>
        <div className="px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

// ── Onglet Signalements ────────────────────────────────────────────────────

function ReportsTab({ token }: { token: string }) {
  const [reports, setReports]     = useState<Report[]>([]);
  const [filter, setFilter]       = useState<"pending" | "resolved" | "ignored">("pending");
  const [loading, setLoading]     = useState(false);
  const [replacing, setReplacing] = useState<Report | null>(null);
  const [replaceUrl, setReplaceUrl] = useState("");
  const [replaceStatus, setReplaceStatus] = useState<"idle"|"loading"|"ok"|"err">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/reports?status=${filter}`, { headers: authHeaders(token) });
      setReports(await r.json());
    } finally { setLoading(false); }
  }, [filter, token]);

  useEffect(() => { load(); }, [load]);

  async function patch(reportId: number, status: string) {
    await fetch(`${API_URL}/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function doReplace() {
    if (!replacing) return;
    setReplaceStatus("loading");
    try {
      const r = await fetch(`${API_URL}/api/admin/matinales/${replacing.matinale_id}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ youtube_url: replaceUrl }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      await patch(replacing.id, "resolved");
      setReplacing(null);
      setReplaceUrl("");
      setReplaceStatus("idle");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Erreur inconnue";
      alert(`Erreur : ${msg}`);
      setReplaceStatus("err");
    }
  }

  return (
    <div>
      {/* Filtre statut */}
      <div className="flex gap-1 mb-5">
        {(["pending", "resolved", "ignored"] as const).map((s) => (
          <button key={s} onClick={() => setFilter(s)}
            className="px-3 py-1 text-xs font-semibold capitalize"
            style={{
              background: filter === s ? "var(--ink)" : "transparent",
              color:      filter === s ? "white"      : "var(--text-muted)",
              border:     "1px solid var(--border)",
            }}>
            {s === "pending" ? "En attente" : s === "resolved" ? "Résolus" : "Ignorés"}
          </button>
        ))}
      </div>

      {loading && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</p>}

      {!loading && reports.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {filter === "pending" ? "✅ Aucun signalement en attente." : "Aucun résultat."}
        </p>
      )}

      <div className="flex flex-col gap-3">
        {reports.map((r) => (
          <div key={r.id} style={{ border: "1px solid var(--border)", padding: "12px 16px" }}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                {/* Chaîne + date */}
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs font-bold px-2 py-0.5" style={{ background: "var(--ink)", color: "white" }}>
                    {r.channel}
                  </span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {fmtDate(r.published_at)}
                  </span>
                </div>
                {/* Titre */}
                <p className="text-xs truncate mb-1" style={{ color: "var(--ink)" }} title={r.title ?? ""}>
                  {r.title ?? "—"}
                </p>
                {/* Raison */}
                <p className="text-xs font-semibold" style={{ color: "var(--accent)" }}>
                  ⚑ {r.reason}
                </p>
                {r.comment && (
                  <p className="text-xs mt-1 italic" style={{ color: "var(--text-muted)" }}>"{r.comment}"</p>
                )}
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Signalé le {fmtDate(r.created_at)}
                </p>
              </div>

              {/* Actions (uniquement si pending) */}
              {filter === "pending" && (
                <div className="flex flex-col gap-1.5 flex-shrink-0">
                  <a href={`https://www.youtube.com/watch?v=${r.youtube_video_id}`}
                    target="_blank" rel="noopener noreferrer"
                    className="text-xs font-semibold px-2 py-1 text-center"
                    style={{ border: "1px solid var(--border)", color: "var(--text-muted)", textDecoration: "none" }}>
                    ▶ Voir
                  </a>
                  <ActionBtn label="✎ Corriger" onClick={() => { setReplacing(r); setReplaceUrl(""); setReplaceStatus("idle"); }} />
                  <ActionBtn label="✓ Résoudre" onClick={() => patch(r.id, "resolved")} />
                  <ActionBtn label="✕ Ignorer"  onClick={() => patch(r.id, "ignored")} danger />
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Modal remplacement vidéo */}
      {replacing && (
        <Modal
          title="Corriger la vidéo"
          subtitle={`${replacing.channel} · ${fmtDate(replacing.published_at)}`}
          onClose={() => setReplacing(null)}
        >
          <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
            Colle l'URL YouTube de la bonne vidéo. Les métadonnées (titre, durée, heure) seront récupérées automatiquement.
          </p>
          <input
            type="text"
            value={replaceUrl}
            onChange={(e) => setReplaceUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            className="w-full text-xs p-2 mb-4 outline-none"
            style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
          />
          <div className="flex gap-3">
            <button onClick={() => setReplacing(null)}
              className="flex-1 px-4 py-2 text-xs font-bold uppercase"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Annuler
            </button>
            <button onClick={doReplace} disabled={!replaceUrl || replaceStatus === "loading"}
              className="flex-1 px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}>
              {replaceStatus === "loading" ? "…" : "Remplacer"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Onglet Matinales ───────────────────────────────────────────────────────

function MatinalesTab({ token }: { token: string }) {
  const [matinales, setMatinales] = useState<AdminMatinale[]>([]);
  const [channels, setChannels]   = useState<Channel[]>([]);
  const [days, setDays]           = useState(30);
  const [loading, setLoading]     = useState(false);
  const [replacing, setReplacing] = useState<AdminMatinale | null>(null);
  const [replaceUrl, setReplaceUrl] = useState("");
  const [showAdd, setShowAdd]     = useState(false);
  const [addChannel, setAddChannel] = useState<number | "">("");
  const [addUrl, setAddUrl]       = useState("");
  const [actionStatus, setActionStatus] = useState<"idle"|"loading"|"ok"|"err">("idle");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [mr, cr] = await Promise.all([
        fetch(`${API_URL}/api/admin/matinales?days=${days}`, { headers: authHeaders(token) }),
        fetch(`${API_URL}/api/channels`),
      ]);
      setMatinales(await mr.json());
      setChannels(await cr.json());
    } finally { setLoading(false); }
  }, [days, token]);

  useEffect(() => { load(); }, [load]);

  async function doDelete(id: number) {
    if (!confirm("Supprimer cette matinale et tous ses snapshots ?")) return;
    await fetch(`${API_URL}/api/admin/matinales/${id}`, {
      method: "DELETE", headers: authHeaders(token),
    });
    load();
  }

  async function doReplace() {
    if (!replacing) return;
    setActionStatus("loading");
    try {
      const r = await fetch(`${API_URL}/api/admin/matinales/${replacing.id}`, {
        method: "PATCH", headers: authHeaders(token),
        body: JSON.stringify({ youtube_url: replaceUrl }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      setReplacing(null); setReplaceUrl(""); setActionStatus("idle");
      load();
    } catch (e: unknown) {
      alert(`Erreur : ${e instanceof Error ? e.message : "Erreur"}`);
      setActionStatus("err");
    }
  }

  async function doAdd() {
    if (!addChannel || !addUrl) return;
    setActionStatus("loading");
    try {
      const r = await fetch(`${API_URL}/api/admin/matinales`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ channel_id: addChannel, youtube_url: addUrl }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      setShowAdd(false); setAddUrl(""); setAddChannel(""); setActionStatus("idle");
      load();
    } catch (e: unknown) {
      alert(`Erreur : ${e instanceof Error ? e.message : "Erreur"}`);
      setActionStatus("err");
    }
  }

  return (
    <div>
      {/* Filtre période + bouton ajouter */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex gap-1">
          {[7, 30, 60].map((d) => (
            <button key={d} onClick={() => setDays(d)}
              className="px-3 py-1 text-xs font-semibold"
              style={{
                background: days === d ? "var(--ink)" : "transparent",
                color:      days === d ? "white"      : "var(--text-muted)",
                border:     "1px solid var(--border)",
              }}>
              {d} j
            </button>
          ))}
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider"
          style={{ background: "var(--accent)", color: "white" }}>
          + Ajouter manuellement
        </button>
      </div>

      {loading && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</p>}

      {/* Tableau */}
      {!loading && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                {["Date", "Chaîne", "Titre", "Durée", "⚑", ""].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matinales.map((m, i) => (
                <tr key={m.id}
                  style={{
                    borderBottom: "1px solid var(--border)",
                    background:   i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                  }}>
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {fmtDate(m.published_at)}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <span className="font-bold px-1.5 py-0.5" style={{ background: "var(--ink)", color: "white" }}>
                      {m.channel}
                    </span>
                  </td>
                  <td className="px-3 py-2 max-w-xs truncate" style={{ color: "var(--text-muted)" }} title={m.title ?? ""}>
                    {m.title ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {fmt(m.duration_seconds)}
                  </td>
                  <td className="px-3 py-2">
                    {m.pending_reports > 0 && (
                      <span className="font-bold px-1.5 py-0.5" style={{ background: "var(--accent)", color: "white" }}>
                        {m.pending_reports}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <div className="flex gap-2">
                      <a href={`https://www.youtube.com/watch?v=${m.youtube_video_id}`}
                        target="_blank" rel="noopener noreferrer"
                        className="font-semibold hover:opacity-70"
                        style={{ color: "var(--accent)", textDecoration: "none" }}>
                        ▶
                      </a>
                      <ActionBtn label="✎" onClick={() => { setReplacing(m); setReplaceUrl(""); setActionStatus("idle"); }} />
                      <ActionBtn label="✕" onClick={() => doDelete(m.id)} danger />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal remplacer */}
      {replacing && (
        <Modal title="Corriger la vidéo" subtitle={`${replacing.channel} · ${fmtDate(replacing.published_at)}`} onClose={() => setReplacing(null)}>
          <input type="text" value={replaceUrl} onChange={(e) => setReplaceUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..." className="w-full text-xs p-2 mb-4 outline-none"
            style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          <div className="flex gap-3">
            <button onClick={() => setReplacing(null)} className="flex-1 px-4 py-2 text-xs font-bold uppercase"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Annuler</button>
            <button onClick={doReplace} disabled={!replaceUrl || actionStatus === "loading"}
              className="flex-1 px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
              style={{ background: "var(--accent)", color: "white" }}>
              {actionStatus === "loading" ? "…" : "Remplacer"}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal ajouter */}
      {showAdd && (
        <Modal title="Ajouter une matinale" subtitle="La vidéo sera récupérée depuis YouTube" onClose={() => setShowAdd(false)}>
          <div className="flex flex-col gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>Chaîne *</label>
              <select value={addChannel} onChange={(e) => setAddChannel(Number(e.target.value))}
                className="w-full text-xs p-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}>
                <option value="">— Choisir une chaîne —</option>
                {channels.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--text-muted)" }}>URL YouTube *</label>
              <input type="text" value={addUrl} onChange={(e) => setAddUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..." className="w-full text-xs p-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
            </div>
            <div className="flex gap-3 pt-1">
              <button onClick={() => setShowAdd(false)} className="flex-1 px-4 py-2 text-xs font-bold uppercase"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Annuler</button>
              <button onClick={doAdd} disabled={!addChannel || !addUrl || actionStatus === "loading"}
                className="flex-1 px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}>
                {actionStatus === "loading" ? "…" : "Ajouter"}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Onglet Jours exclus ────────────────────────────────────────────────────

function ExcludedDaysTab({ token }: { token: string }) {
  const [days, setDays]     = useState<ExcludedDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [date, setDate]     = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/excluded-days`, { headers: authHeaders(token) });
      setDays(await r.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function doAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    setAdding(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/excluded-days`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ date, reason: reason || null }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      setDate(""); setReason("");
      load();
    } catch (e: unknown) {
      alert(`Erreur : ${e instanceof Error ? e.message : "Erreur"}`);
    } finally { setAdding(false); }
  }

  async function doDelete(id: number) {
    await fetch(`${API_URL}/api/admin/excluded-days/${id}`, {
      method: "DELETE", headers: authHeaders(token),
    });
    load();
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Formulaire ajout */}
      <div style={{ border: "1px solid var(--border)", padding: "16px 20px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Exclure un jour
        </p>
        <form onSubmit={doAdd} className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Date *</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              className="text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <div className="flex-1" style={{ minWidth: 180 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Motif (optionnel)</label>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder="Ex : Grève nationale, élections…"
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <button type="submit" disabled={!date || adding}
            className="px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
            style={{ background: "var(--ink)", color: "white" }}>
            {adding ? "…" : "+ Exclure"}
          </button>
        </form>
      </div>

      {/* Liste */}
      {loading && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</p>}
      {!loading && days.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Aucun jour exclu manuellement.</p>
      )}
      {days.length > 0 && (
        <div className="flex flex-col gap-2">
          {days.map((d) => (
            <div key={d.id} className="flex items-center justify-between gap-4 px-4 py-2.5"
              style={{ border: "1px solid var(--border)", background: "var(--surface2)" }}>
              <div>
                <span className="text-sm font-bold font-mono" style={{ color: "var(--ink)" }}>
                  {d.date}
                </span>
                {d.reason && (
                  <span className="text-xs ml-3" style={{ color: "var(--text-muted)" }}>{d.reason}</span>
                )}
              </div>
              <ActionBtn label="✕ Retirer" onClick={() => doDelete(d.id)} danger />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────

export default function AdminPage() {
  const [token, setToken]     = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [loginErr, setLoginErr] = useState(false);
  const [logging, setLogging]   = useState(false);
  const [tab, setTab]           = useState<Tab>("reports");
  const [reportCount, setReportCount] = useState(0);

  // Lit le token depuis sessionStorage au chargement
  useEffect(() => {
    const t = sessionStorage.getItem("adminToken");
    if (t) setToken(t);
  }, []);

  // Compte les signalements en attente (badge)
  useEffect(() => {
    if (!token) return;
    fetch(`${API_URL}/api/admin/reports?status=pending`, { headers: authHeaders(token) })
      .then((r) => r.json())
      .then((data: Report[]) => setReportCount(data.length))
      .catch(() => {});
  }, [token]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLogging(true); setLoginErr(false);
    try {
      const r = await fetch(`${API_URL}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!r.ok) { setLoginErr(true); return; }
      const { token: t } = await r.json();
      sessionStorage.setItem("adminToken", t);
      setToken(t);
    } finally { setLogging(false); }
  }

  function handleLogout() {
    sessionStorage.removeItem("adminToken");
    setToken(null);
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "reports",  label: "Signalements",  badge: reportCount },
    { key: "matinales",label: "Matinales"                          },
    { key: "excluded", label: "Jours exclus"                       },
  ];

  // ── Écran de connexion ────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6"
        style={{ background: "var(--bg)" }}>
        <div className="w-full max-w-sm" style={{ border: "2px solid var(--ink)", background: "var(--surface)" }}>
          <div className="px-6 py-5" style={{ borderBottom: "2px solid var(--ink)" }}>
            <p className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--accent)", letterSpacing: "0.2em" }}>MediaPulse</p>
            <h1 className="font-display font-bold mt-0.5" style={{ fontSize: 22, color: "var(--ink)" }}>
              Administration
            </h1>
          </div>
          <form onSubmit={handleLogin} className="px-6 py-6 flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold uppercase tracking-wider block mb-1.5"
                style={{ color: "var(--text-muted)" }}>Mot de passe</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
                required
                className="w-full text-sm p-2 outline-none"
                style={{
                  border: `1px solid ${loginErr ? "var(--accent)" : "var(--border)"}`,
                  background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit",
                }}
              />
              {loginErr && (
                <p className="text-xs mt-1" style={{ color: "var(--accent)" }}>Mot de passe incorrect.</p>
              )}
            </div>
            <button type="submit" disabled={logging}
              className="w-full py-2.5 text-sm font-bold uppercase tracking-wider disabled:opacity-50"
              style={{ background: "var(--ink)", color: "white" }}>
              {logging ? "Vérification…" : "Accéder"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Interface admin ───────────────────────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div style={{ background: "var(--accent)", height: 4 }} />

      {/* Header */}
      <header style={{ background: "var(--surface)", borderBottom: "2px solid var(--ink)" }}>
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-end justify-between">
          <div>
            <h1 className="font-display font-bold leading-none" style={{ fontSize: 32, color: "var(--ink)", fontWeight: 900 }}>
              MEDIAPULSE
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest mt-1"
              style={{ color: "var(--accent)", letterSpacing: "0.2em" }}>
              Administration
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a href="/dashboard" className="text-xs font-semibold" style={{ color: "var(--text-muted)", textDecoration: "none" }}>
              ← Dashboard
            </a>
            <button onClick={handleLogout}
              className="text-xs font-semibold px-3 py-1.5"
              style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {/* Onglets */}
        <div className="flex gap-0 mb-8" style={{ borderBottom: "2px solid var(--ink)" }}>
          {TABS.map(({ key, label, badge }) => (
            <button key={key} onClick={() => setTab(key)}
              className="px-5 py-3 text-sm font-bold transition-colors flex items-center gap-1"
              style={{
                background:   tab === key ? "var(--ink)"      : "transparent",
                color:        tab === key ? "white"           : "var(--text-muted)",
                borderBottom: tab === key ? "2px solid var(--ink)" : "none",
                marginBottom: tab === key ? -2 : 0,
              }}>
              {label}
              {badge != null && badge > 0 && <Badge n={badge} />}
            </button>
          ))}
        </div>

        {/* Contenu de l'onglet */}
        {tab === "reports"   && <ReportsTab   token={token} />}
        {tab === "matinales" && <MatinalesTab token={token} />}
        {tab === "excluded"  && <ExcludedDaysTab token={token} />}
      </main>
    </div>
  );
}
