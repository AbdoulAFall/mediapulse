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
  skip_collection: boolean;  // true = jour exclu (rouge), false = fête info uniquement (orange)
  created_at: string;
}

interface Channel {
  id: number;
  name: string;
}

interface AdminChannel {
  id: number;
  name: string;
  handle: string | null;
  channel_id: string;
  playlist_id: string;
  active: number | boolean;
  resolved_at: string;
  matinale_start: string;
  matinale_end: string;
  title_hints: string;   // JSON string "[]" ou "[\"infos matin\"]"
  matinale_count: number;
}

interface Subscriber {
  id: number;
  email: string;
  name: string | null;
  active: boolean;
  created_at: string;
}

type Tab = "reports" | "matinales" | "excluded" | "subscribers" | "tools" | "rules" | "channels";

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

  // Charge les chaînes une seule fois (endpoint public, indépendant du token)
  useEffect(() => {
    fetch(`${API_URL}/api/channels`)
      .then((r) => r.json())
      .then(setChannels)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/matinales?days=${days}`, { headers: authHeaders(token) });
      if (!r.ok) throw new Error();
      setMatinales(await r.json());
    } catch {
      setMatinales([]);
    } finally { setLoading(false); }
  }, [days, token]);

  useEffect(() => { load(); }, [load]);

  async function doDelete(id: number) {
    if (!confirm("Supprimer cette matinale et tous ses snapshots ?")) return;
    const r = await fetch(`${API_URL}/api/admin/matinales/${id}`, {
      method: "DELETE", headers: authHeaders(token),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      alert(`Erreur ${r.status} : ${body.detail ?? "Suppression impossible"}`);
      return;
    }
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

const FR_DAYS        = ["Dimanche","Lundi","Mardi","Mercredi","Jeudi","Vendredi","Samedi"];
const FR_DAYS_SHORT  = ["Dim","Lun","Mar","Mer","Jeu","Ven","Sam"];
const FR_MONTHS      = ["Janvier","Février","Mars","Avril","Mai","Juin",
                        "Juillet","Août","Septembre","Octobre","Novembre","Décembre"];

function isWeekend(dateStr: string) {
  const d = new Date(dateStr + "T12:00:00Z");
  return d.getUTCDay() === 0 || d.getUTCDay() === 6;
}
function getDayName(dateStr: string) {
  return FR_DAYS[new Date(dateStr + "T12:00:00Z").getUTCDay()];
}
function getDayShort(dateStr: string) {
  return FR_DAYS_SHORT[new Date(dateStr + "T12:00:00Z").getUTCDay()];
}

/** Génère tous les jours notables d'une année (weekends + jours enregistrés) */
function buildYearExclusions(
  year: number,
  manualDays: ExcludedDay[],
): { date: string; type: "weekend" | "excluded" | "feast"; reason: string | null; id?: number }[] {
  // "excluded" = skip_collection true (rouge), "feast" = skip_collection false (orange)
  const manualMap = Object.fromEntries(
    manualDays.filter((d) => !isWeekend(d.date)).map((d) => [d.date, d])
  );
  const result = [];
  for (let m = 0; m < 12; m++) {
    const daysInMonth = new Date(Date.UTC(year, m + 1, 0)).getUTCDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      const dow = new Date(dateStr + "T12:00:00Z").getUTCDay();
      if (dow === 0 || dow === 6) {
        result.push({ date: dateStr, type: "weekend" as const, reason: "Week-end" });
      } else if (manualMap[dateStr]) {
        const entry = manualMap[dateStr];
        const type  = entry.skip_collection !== false ? "excluded" : "feast";
        result.push({ date: dateStr, type: type as "excluded" | "feast", reason: entry.reason, id: entry.id });
      }
    }
  }
  return result;
}

function ExcludedDaysTab({ token }: { token: string }) {
  const currentYear = new Date().getFullYear();
  const [manualDays, setManualDays]       = useState<ExcludedDay[]>([]);
  const [loading, setLoading]             = useState(false);
  const [year, setYear]                   = useState(currentYear);
  const [date, setDate]                   = useState("");
  const [reason, setReason]               = useState("");
  const [skipCollection, setSkipCollection] = useState(true);
  const [adding, setAdding]               = useState(false);
  const [showForm, setShowForm]           = useState(false);
  // Édition
  const [editing, setEditing]             = useState<ExcludedDay | null>(null);
  const [editReason, setEditReason]       = useState("");
  const [editSkip, setEditSkip]           = useState(true);
  const [saving, setSaving]               = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/excluded-days`, { headers: authHeaders(token) });
      setManualDays(await r.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function doAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!date) return;
    if (isWeekend(date)) {
      alert("Les week-ends sont déjà exclus automatiquement.");
      return;
    }
    if (!reason.trim()) {
      alert("Le motif est obligatoire (il apparaît sur la timeline).");
      return;
    }
    setAdding(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/excluded-days`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ date, reason: reason.trim(), skip_collection: skipCollection }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      setDate(""); setReason(""); setSkipCollection(true); setShowForm(false);
      load();
    } catch (err: unknown) {
      alert(`Erreur : ${err instanceof Error ? err.message : "Erreur"}`);
    } finally { setAdding(false); }
  }

  function openEdit(day: ExcludedDay) {
    setEditing(day);
    setEditReason(day.reason ?? "");
    setEditSkip(day.skip_collection !== false);
  }

  async function doSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/excluded-days/${editing.id}`, {
        method: "PATCH",
        headers: authHeaders(token),
        body: JSON.stringify({ reason: editReason.trim(), skip_collection: editSkip }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      setEditing(null);
      load();
    } catch (err: unknown) {
      alert(`Erreur : ${err instanceof Error ? err.message : "Erreur"}`);
    } finally { setSaving(false); }
  }

  async function doDelete(id: number) {
    if (!confirm("Retirer ce jour de l'exclusion ?")) return;
    await fetch(`${API_URL}/api/admin/excluded-days/${id}`, {
      method: "DELETE", headers: authHeaders(token),
    });
    load();
  }

  const allExclusions  = buildYearExclusions(year, manualDays);
  const totalWeekends  = allExclusions.filter((d) => d.type === "weekend").length;
  const excludedDays   = allExclusions.filter((d) => d.type === "excluded");
  const feastDays      = allExclusions.filter((d) => d.type === "feast");
  const manualWeekdays = [...excludedDays, ...feastDays];

  // Groupé par mois
  const byMonth: typeof allExclusions[] = Array.from({ length: 12 }, (_, m) =>
    allExclusions.filter((d) => parseInt(d.date.split("-")[1]) === m + 1)
  );

  return (
    <div className="flex flex-col gap-6">

      {/* Barre de contrôle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Sélecteur d'année */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "var(--text-muted)" }}>Année</span>
          {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
            <button key={y} onClick={() => setYear(y)}
              className="px-3 py-1 text-xs font-bold"
              style={{
                background: year === y ? "var(--ink)" : "transparent",
                color:      year === y ? "white"      : "var(--text-muted)",
                border:     "1px solid var(--border)",
              }}>
              {y}
            </button>
          ))}
        </div>

        {/* Résumé */}
        <div className="flex items-center gap-4 text-xs" style={{ color: "var(--text-muted)" }}>
          <span><strong style={{ color: "var(--ink)" }}>{totalWeekends}</strong> week-ends</span>
          <span>+</span>
          <span><strong style={{ color: "var(--accent)" }}>{excludedDays.length}</strong> exclus</span>
          {feastDays.length > 0 && (
            <>
              <span>+</span>
              <span><strong style={{ color: "#f59e0b" }}>{feastDays.length}</strong> fêtes info</span>
            </>
          )}
          <span>=</span>
          <span><strong style={{ color: "var(--ink)" }}>{totalWeekends + excludedDays.length}</strong> jours sans collecte</span>
        </div>

        {/* Bouton ajouter */}
        <button onClick={() => setShowForm((v) => !v)}
          className="px-4 py-2 text-xs font-bold uppercase"
          style={{ background: showForm ? "var(--surface2)" : "var(--ink)", color: showForm ? "var(--text-muted)" : "white", border: "1px solid var(--border)" }}>
          {showForm ? "✕ Annuler" : "+ Ajouter un jour férié"}
        </button>
      </div>

      {/* Formulaire ajout (collapsible) */}
      {showForm && (
        <div style={{ border: "1px solid var(--border)", padding: "16px 20px", background: "var(--surface)" }}>
          <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            Ajouter un jour notable
          </p>
          <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
            Le motif s&apos;affiche en tooltip sur les tableaux et la timeline. Les week-ends sont exclus automatiquement.
          </p>
          <form onSubmit={doAdd} className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Date *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required
                className="text-xs p-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
              {date && (
                <p className="text-xs mt-1 font-semibold" style={{ color: isWeekend(date) ? "var(--accent)" : "#2e7d32" }}>
                  {isWeekend(date) ? "⚠ Week-end — déjà exclu automatiquement" : `✓ ${getDayName(date)}`}
                </p>
              )}
            </div>
            <div className="flex-1" style={{ minWidth: 200 }}>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
                Motif * <span style={{ fontWeight: 400 }}>(visible en tooltip)</span>
              </label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                placeholder="Ex : Lundi de Pâques, Tabaski, Magal…"
                className="w-full text-xs p-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
            </div>
            {/* Checkbox Exclure de la collecte */}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-bold" style={{ color: "var(--text-muted)" }}>Comportement</label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none"
                style={{ color: skipCollection ? "var(--accent)" : "#f59e0b", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={skipCollection}
                  onChange={(e) => setSkipCollection(e.target.checked)}
                  style={{ accentColor: skipCollection ? "var(--accent)" : "#f59e0b" }}
                />
                {skipCollection ? "🔴 Exclure de la collecte" : "🟠 Fête info (collecte maintenue)"}
              </label>
              <p className="text-xs" style={{ color: "var(--text-muted)", maxWidth: 240 }}>
                {skipCollection
                  ? "Aucune matinale attendue ce jour."
                  : "Certaines TV diffusent, tooltip affiché uniquement."}
              </p>
            </div>
            <button type="submit" disabled={!date || !reason.trim() || adding || isWeekend(date)}
              className="px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
              style={{ background: "var(--ink)", color: "white" }}>
              {adding ? "…" : "+ Ajouter"}
            </button>
          </form>
        </div>
      )}

      {/* Légende */}
      <div className="flex flex-wrap items-center gap-5 text-xs" style={{ color: "var(--text-muted)" }}>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 font-bold"
            style={{ background: "#f0ede8", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            Sam / Dim
          </span>
          <span>Week-end (auto)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 font-bold"
            style={{ background: "#fdecea", border: "1px solid var(--accent)", color: "var(--accent)" }}>
            🔴 Jour exclu
          </span>
          <span>Collecte bloquée · tooltip rouge dans le dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-block px-2 py-0.5 font-bold"
            style={{ background: "#fffbeb", border: "1px solid #f59e0b", color: "#b45309" }}>
            🟠 Fête info
          </span>
          <span>Collecte maintenue · tooltip orange dans le dashboard</span>
        </div>
      </div>

      {/* Table de gestion des jours manuels */}
      <div style={{ border: "1px solid var(--border)" }}>
        <div className="px-5 py-3 flex items-center justify-between"
          style={{ borderBottom: "2px solid var(--ink)", background: "var(--surface)" }}>
          <div>
            <p className="text-xs font-bold uppercase tracking-widest"
              style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>Jours enregistrés</p>
            <p className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
              {manualWeekdays.length} jour{manualWeekdays.length > 1 ? "s" : ""} configuré{manualWeekdays.length > 1 ? "s" : ""} manuellement
            </p>
          </div>
        </div>

        {loading && (
          <p className="px-5 py-4 text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</p>
        )}

        {!loading && manualWeekdays.length === 0 && (
          <p className="px-5 py-4 text-sm" style={{ color: "var(--text-muted)" }}>
            Aucun jour configuré. Utilisez "+ Ajouter un jour férié" ci-dessus.
          </p>
        )}

        {!loading && manualWeekdays.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  {["Date", "Jour", "Motif", "Type", "Collecte", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[...manualWeekdays].sort((a, b) => b.date.localeCompare(a.date)).map((entry, i) => {
                  const isExcluded = entry.type === "excluded";
                  return (
                    <tr key={entry.date}
                      style={{
                        borderBottom: "1px solid var(--border)",
                        background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                      }}>
                      <td className="px-4 py-2.5 font-mono font-semibold whitespace-nowrap"
                        style={{ color: "var(--ink)" }}>
                        {fmtDate(entry.date + "T12:00:00Z")}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {getDayName(entry.date)}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: "var(--ink)" }}>
                        {entry.reason ?? <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="px-2 py-0.5 font-bold text-xs"
                          style={{
                            background: isExcluded ? "#fdecea" : "#fffbeb",
                            border: `1px solid ${isExcluded ? "var(--accent)" : "#f59e0b"}`,
                            color: isExcluded ? "var(--accent)" : "#b45309",
                          }}>
                          {isExcluded ? "🔴 Exclu" : "🟠 Fête info"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-semibold text-xs"
                          style={{ color: isExcluded ? "var(--accent)" : "#2e7d32" }}>
                          {isExcluded ? "Bloquée" : "Maintenue"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <div className="flex gap-2">
                          <ActionBtn label="✎ Éditer" onClick={() => entry.id && openEdit(
                            manualDays.find((d) => d.id === entry.id)!
                          )} />
                          <ActionBtn label="✕" onClick={() => entry.id && doDelete(entry.id)} danger />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modale d'édition */}
      {editing && (
        <Modal
          title="Modifier le jour"
          subtitle={`${getDayName(editing.date)} ${fmtDate(editing.date + "T12:00:00Z")}`}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={doSaveEdit} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
                Motif * <span style={{ fontWeight: 400 }}>(visible en tooltip)</span>
              </label>
              <input
                type="text"
                value={editReason}
                onChange={(e) => setEditReason(e.target.value)}
                required
                className="w-full text-xs p-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
              />
            </div>
            <div>
              <label className="text-xs font-bold block mb-2" style={{ color: "var(--text-muted)" }}>Comportement</label>
              <label className="flex items-center gap-2 text-xs cursor-pointer select-none"
                style={{ color: editSkip ? "var(--accent)" : "#f59e0b", fontWeight: 600 }}>
                <input
                  type="checkbox"
                  checked={editSkip}
                  onChange={(e) => setEditSkip(e.target.checked)}
                  style={{ accentColor: editSkip ? "var(--accent)" : "#f59e0b" }}
                />
                {editSkip ? "🔴 Exclure de la collecte" : "🟠 Fête info (collecte maintenue)"}
              </label>
              <p className="text-xs mt-1.5" style={{ color: "var(--text-muted)" }}>
                {editSkip
                  ? "Aucune matinale attendue ce jour — la collecte YouTube sera ignorée."
                  : "Certaines TV diffusent ce jour — tooltip affiché, collecte maintenue."}
              </p>
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)}
                className="flex-1 px-4 py-2 text-xs font-bold uppercase"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                Annuler
              </button>
              <button type="submit" disabled={!editReason.trim() || saving}
                className="flex-1 px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}>
                {saving ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Calendrier annuel */}
      {loading
        ? <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</p>
        : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {byMonth.map((entries, m) => (
              <div key={m} style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                {/* En-tête mois */}
                <div className="px-4 py-2 flex items-center justify-between"
                  style={{ borderBottom: "1px solid var(--border)", background: "var(--surface2)" }}>
                  <span className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--ink)" }}>
                    {FR_MONTHS[m]} {year}
                  </span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)" }}>
                    {entries.filter((e) => e.type === "excluded").length > 0 && (
                      <span style={{ color: "var(--accent)", fontWeight: 700 }}>
                        {entries.filter((e) => e.type === "excluded").length}🔴{" "}
                      </span>
                    )}
                    {entries.filter((e) => e.type === "feast").length > 0 && (
                      <span style={{ color: "#f59e0b", fontWeight: 700 }}>
                        {entries.filter((e) => e.type === "feast").length}🟠{" "}
                      </span>
                    )}
                    {entries.filter((e) => e.type === "weekend").length} W-E
                  </span>
                </div>

                {/* Chips des jours */}
                <div className="p-3 flex flex-wrap gap-1.5">
                  {entries.length === 0 ? (
                    <span className="text-xs italic" style={{ color: "var(--text-muted)" }}>Aucun jour notable</span>
                  ) : entries.map((entry) => {
                    if (entry.type === "weekend") return (
                      <span key={entry.date}
                        className="text-xs px-2 py-0.5 font-mono"
                        style={{ background: "#f0ede8", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
                        {getDayShort(entry.date)} {parseInt(entry.date.split("-")[2])}
                      </span>
                    );
                    const isExcluded = entry.type === "excluded";
                    const bg          = isExcluded ? "#fdecea" : "#fffbeb";
                    const borderColor = isExcluded ? "var(--accent)" : "#f59e0b";
                    const textColor   = isExcluded ? "var(--accent)" : "#b45309";
                    return (
                      <span key={entry.date}
                        className="text-xs px-2 py-0.5 font-semibold flex items-center gap-1"
                        style={{ background: bg, border: `1px solid ${borderColor}`, color: textColor }}
                        title={entry.reason ?? ""}>
                        {isExcluded ? "🔴" : "🟠"} {getDayShort(entry.date)} {parseInt(entry.date.split("-")[2])} · {entry.reason}
                        <button
                          onClick={() => entry.id && doDelete(entry.id)}
                          className="ml-1 font-bold leading-none hover:opacity-60"
                          style={{ fontSize: 10, lineHeight: 1 }}
                          title="Retirer ce jour">
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )
      }
    </div>
  );
}

// ── Onglet Abonnés ─────────────────────────────────────────────────────────

function SubscribersTab({ token }: { token: string }) {
  const [subs, setSubs]       = useState<Subscriber[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail]     = useState("");
  const [name, setName]       = useState("");
  const [adding, setAdding]   = useState(false);
  const [sending, setSending] = useState<"idle"|"loading"|"ok"|"err">("idle");
  const [sendMsg, setSendMsg] = useState("");
  const [reportDate, setReportDate] = useState(() => new Date().toISOString().slice(0, 10));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/subscribers`, { headers: authHeaders(token) });
      setSubs(await r.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  async function doAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!email) return;
    setAdding(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/subscribers`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({ email: email.trim(), name: name.trim() || null }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      setEmail(""); setName("");
      load();
    } catch (e: unknown) {
      alert(`Erreur : ${e instanceof Error ? e.message : "Erreur"}`);
    } finally { setAdding(false); }
  }

  async function doToggle(id: number) {
    await fetch(`${API_URL}/api/admin/subscribers/${id}`, {
      method: "PATCH", headers: authHeaders(token),
    });
    load();
  }

  async function doDelete(id: number, email: string) {
    if (!confirm(`Supprimer ${email} de la liste ?`)) return;
    await fetch(`${API_URL}/api/admin/subscribers/${id}`, {
      method: "DELETE", headers: authHeaders(token),
    });
    load();
  }

  async function doSendNow() {
    if (!confirm(`Envoyer le rapport du ${reportDate} à ${subs.filter(s => s.active).length} abonné(s) ?`)) return;
    setSending("loading"); setSendMsg("");
    try {
      const r = await fetch(`${API_URL}/api/admin/report/send`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({ date: reportDate }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setSending("ok");
      setSendMsg(`✓ Rapport du ${reportDate} envoyé à ${data.recipients.join(", ")} (${data.matinales} matinale(s))`);
    } catch (e: unknown) {
      setSending("err");
      setSendMsg(`✗ ${e instanceof Error ? e.message : "Erreur inconnue"}`);
    }
  }

  const activeCount = subs.filter((s) => s.active).length;

  return (
    <div className="flex flex-col gap-6">
      {/* Info + envoi manuel */}
      <div style={{ border: "1px solid var(--border)", padding: "16px 20px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Envoi manuel — {activeCount} abonné{activeCount > 1 ? "s" : ""} actif{activeCount > 1 ? "s" : ""}
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
              Date du rapport
            </label>
            <input
              type="date"
              value={reportDate}
              onChange={(e) => { setReportDate(e.target.value); setSending("idle"); setSendMsg(""); }}
              className="text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
            />
          </div>
          <button
            onClick={doSendNow}
            disabled={sending === "loading" || activeCount === 0}
            className="px-4 py-2 text-xs font-bold uppercase tracking-wider whitespace-nowrap disabled:opacity-40 transition-opacity hover:opacity-80"
            style={{ background: "var(--accent)", color: "white" }}>
            {sending === "loading" ? "Envoi…" : "▶ Envoyer"}
          </button>
        </div>
        <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          📅 Rapport automatique chaque jour ouvré à 16h UTC.
        </p>
      </div>

      {/* Feedback envoi */}
      {sendMsg && (
        <p className="text-xs px-1" style={{ color: sending === "ok" ? "#2e7d32" : "var(--accent)" }}>
          {sendMsg}
        </p>
      )}

      {/* Formulaire ajout */}
      <div style={{ border: "1px solid var(--border)", padding: "16px 20px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Ajouter un abonné
        </p>
        <form onSubmit={doAdd} className="flex flex-wrap gap-3 items-end">
          <div className="flex-1" style={{ minWidth: 200 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Email *</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
              placeholder="contact@exemple.com"
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <div className="flex-1" style={{ minWidth: 160 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Nom (optionnel)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="Prénom Nom"
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <button type="submit" disabled={!email || adding}
            className="px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
            style={{ background: "var(--ink)", color: "white" }}>
            {adding ? "…" : "+ Ajouter"}
          </button>
        </form>
      </div>

      {/* Liste */}
      {loading && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</p>}
      {!loading && subs.length === 0 && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>Aucun abonné pour l&apos;instant.</p>
      )}
      {subs.length > 0 && (
        <div className="flex flex-col gap-2">
          {subs.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4 px-4 py-3"
              style={{
                border: "1px solid var(--border)",
                background: s.active ? "var(--surface)" : "var(--surface2)",
                opacity: s.active ? 1 : 0.6,
              }}>
              <div className="flex items-center gap-3 min-w-0">
                {/* Indicateur actif */}
                <div style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: s.active ? "#2e7d32" : "var(--border)",
                }} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
                    {s.email}
                  </p>
                  {s.name && (
                    <p className="text-xs" style={{ color: "var(--text-muted)" }}>{s.name}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <ActionBtn
                  label={s.active ? "⏸ Désactiver" : "▶ Activer"}
                  onClick={() => doToggle(s.id)}
                />
                <ActionBtn label="✕" onClick={() => doDelete(s.id, s.email)} danger />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Onglet Chaînes ─────────────────────────────────────────────────────────

function ChannelsTab({ token }: { token: string }) {
  const [channels, setChannels] = useState<AdminChannel[]>([]);
  const [loading, setLoading]   = useState(false);
  // Ajout
  const [name, setName]         = useState("");
  const [handle, setHandle]     = useState("");
  const [addStart, setAddStart] = useState("07:00");
  const [addEnd, setAddEnd]     = useState("11:00");
  const [addHints, setAddHints] = useState("");
  const [adding, setAdding]     = useState(false);
  const [addMsg, setAddMsg]     = useState<{ ok: boolean; text: string } | null>(null);
  // Édition
  const [editing, setEditing]   = useState<AdminChannel | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd]   = useState("");
  const [editHints, setEditHints] = useState("");
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API_URL}/api/admin/channels`, { headers: authHeaders(token) });
      if (r.ok) setChannels(await r.json());
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  function openEdit(ch: AdminChannel) {
    let hints: string[] = [];
    try { hints = JSON.parse(ch.title_hints || "[]"); } catch { hints = []; }
    setEditing(ch);
    setEditName(ch.name);
    setEditStart(ch.matinale_start || "07:00");
    setEditEnd(ch.matinale_end || "11:00");
    setEditHints(hints.join(", "));
  }

  async function doSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const hints = editHints.split(",").map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`${API_URL}/api/admin/channels/${editing.id}`, {
        method: "PUT", headers: authHeaders(token),
        body: JSON.stringify({
          name:           editName.trim(),
          matinale_start: editStart,
          matinale_end:   editEnd,
          title_hints:    hints,
        }),
      });
      if (!r.ok) throw new Error((await r.json()).detail);
      setEditing(null);
      load();
    } catch (err: unknown) {
      alert(`Erreur : ${err instanceof Error ? err.message : "Erreur"}`);
    } finally { setSaving(false); }
  }

  async function doAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !handle.trim()) return;
    setAdding(true); setAddMsg(null);
    try {
      const hints = addHints.split(",").map((s) => s.trim()).filter(Boolean);
      const r = await fetch(`${API_URL}/api/admin/channels`, {
        method: "POST", headers: authHeaders(token),
        body: JSON.stringify({
          name: name.trim(), handle: handle.trim(),
          matinale_start: addStart, matinale_end: addEnd,
          title_hints: hints,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      const resolved = data.resolved_name ? ` (YouTube : "${data.resolved_name}")` : "";
      setAddMsg({ ok: true, text: `✓ Chaîne ajoutée — ${data.channel_id}${resolved}` });
      setName(""); setHandle(""); setAddHints(""); setAddStart("07:00"); setAddEnd("11:00");
      load();
    } catch (err: unknown) {
      setAddMsg({ ok: false, text: `✗ ${err instanceof Error ? err.message : "Erreur"}` });
    } finally { setAdding(false); }
  }

  async function doToggle(id: number) {
    await fetch(`${API_URL}/api/admin/channels/${id}`, { method: "PATCH", headers: authHeaders(token) });
    load();
  }

  async function doDelete(id: number, chName: string, cnt: number) {
    if (cnt > 0) { alert(`Impossible : ${cnt} matinale(s) liée(s) — désactivez à la place.`); return; }
    if (!confirm(`Supprimer définitivement "${chName}" ?`)) return;
    const r = await fetch(`${API_URL}/api/admin/channels/${id}`, { method: "DELETE", headers: authHeaders(token) });
    if (!r.ok) { const d = await r.json().catch(() => ({})); alert(d.detail || "Erreur"); }
    load();
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Formulaire ajout */}
      <div style={{ border: "1px solid var(--border)", padding: "16px 20px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Ajouter une chaîne
        </p>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Le channel ID est résolu automatiquement via YouTube. La configuration est sauvegardée en base — le collector la lira directement.
        </p>
        <form onSubmit={doAdd} className="flex flex-wrap gap-3 items-end">
          <div style={{ minWidth: 140 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Nom *</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required placeholder="TFM"
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <div className="flex-1" style={{ minWidth: 200 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Handle / URL YouTube *</label>
            <input type="text" value={handle} onChange={(e) => setHandle(e.target.value)} required placeholder="@TFMofficiel"
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <div style={{ width: 80 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Début UTC</label>
            <input type="time" value={addStart} onChange={(e) => setAddStart(e.target.value)}
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <div style={{ width: 80 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Fin UTC</label>
            <input type="time" value={addEnd} onChange={(e) => setAddEnd(e.target.value)}
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <div className="flex-1" style={{ minWidth: 180 }}>
            <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
              Mots-clés titre <span style={{ fontWeight: 400 }}>(séparés par des virgules)</span>
            </label>
            <input type="text" value={addHints} onChange={(e) => setAddHints(e.target.value)} placeholder="infos matin, revue de presse"
              className="w-full text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
          </div>
          <button type="submit" disabled={!name.trim() || !handle.trim() || adding}
            className="px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
            style={{ background: "var(--ink)", color: "white" }}>
            {adding ? "Résolution…" : "+ Ajouter"}
          </button>
        </form>
        {addMsg && (
          <p className="text-xs mt-3" style={{ color: addMsg.ok ? "#2e7d32" : "var(--accent)" }}>{addMsg.text}</p>
        )}
      </div>

      {/* Liste */}
      {loading && <p className="text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</p>}
      {!loading && (
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            {channels.length} chaîne{channels.length > 1 ? "s" : ""} en base
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  {["Chaîne", "Fenêtre UTC", "Mots-clés", "Matinales", "Statut", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider whitespace-nowrap"
                      style={{ color: "var(--text-muted)", letterSpacing: "0.1em" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {channels.map((ch, i) => {
                  const isActive = ch.active === 1 || ch.active === true;
                  let hints: string[] = [];
                  try { hints = JSON.parse(ch.title_hints || "[]"); } catch { hints = []; }
                  return (
                    <tr key={ch.id} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                      <td className="px-3 py-2">
                        <div className="font-bold" style={{ color: "var(--ink)" }}>{ch.name}</div>
                        <div className="font-mono text-xs" style={{ color: "var(--text-muted)", fontSize: 10 }}>
                          <a href={`https://www.youtube.com/channel/${ch.channel_id}`} target="_blank" rel="noopener noreferrer"
                            style={{ color: "var(--accent)", textDecoration: "none" }}>
                            {ch.handle ?? ch.channel_id}
                          </a>
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                        {ch.matinale_start ?? "07:00"} – {ch.matinale_end ?? "11:00"}
                      </td>
                      <td className="px-3 py-2">
                        {hints.length > 0
                          ? <div className="flex flex-wrap gap-1">
                              {hints.map((h) => (
                                <span key={h} className="px-1.5 py-0.5 font-mono"
                                  style={{ background: "var(--ink)", color: "white", fontSize: 9 }}>{h}</span>
                              ))}
                            </div>
                          : <span className="italic" style={{ color: "var(--text-muted)", fontSize: 10 }}>Fenêtre seule</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-center font-mono" style={{ color: "var(--text-muted)" }}>
                        {ch.matinale_count}
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 text-xs font-bold"
                          style={{ background: isActive ? "#e8f5e9" : "var(--surface2)", color: isActive ? "#2e7d32" : "var(--text-muted)", border: `1px solid ${isActive ? "#a5d6a7" : "var(--border)"}` }}>
                          {isActive ? "● Actif" : "○ Inactif"}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="flex gap-2">
                          <ActionBtn label="✎ Éditer" onClick={() => openEdit(ch)} />
                          <ActionBtn label={isActive ? "⏸" : "▶"} onClick={() => doToggle(ch.id)} />
                          <ActionBtn label="✕" onClick={() => doDelete(ch.id, ch.name, ch.matinale_count)} danger disabled={ch.matinale_count > 0} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs mt-3" style={{ color: "var(--text-muted)" }}>
            ℹ ✎ pour modifier la fenêtre horaire ou les mots-clés. La suppression est bloquée si des matinales sont liées.
          </p>
        </div>
      )}

      {/* Modal édition */}
      {editing && (
        <Modal title={`Éditer — ${editing.name}`} subtitle="Modifications prises en compte au prochain sync" onClose={() => setEditing(null)}>
          <form onSubmit={doSave} className="flex flex-col gap-4">
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Nom affiché</label>
              <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} required
                className="w-full text-xs p-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
            </div>
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Début UTC</label>
                <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                  className="w-full text-xs p-2 outline-none"
                  style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
              </div>
              <div className="flex-1">
                <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>Fin UTC</label>
                <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                  className="w-full text-xs p-2 outline-none"
                  style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
              </div>
            </div>
            <div>
              <label className="text-xs font-bold block mb-1" style={{ color: "var(--text-muted)" }}>
                Mots-clés titre <span style={{ fontWeight: 400 }}>(séparés par des virgules — vide = fenêtre horaire seule)</span>
              </label>
              <input type="text" value={editHints} onChange={(e) => setEditHints(e.target.value)}
                placeholder="infos matin, revue de presse"
                className="w-full text-xs p-2 outline-none"
                style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }} />
            </div>
            <div className="flex gap-3 pt-1">
              <button type="button" onClick={() => setEditing(null)}
                className="flex-1 px-4 py-2 text-xs font-bold uppercase"
                style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>Annuler</button>
              <button type="submit" disabled={saving}
                className="flex-1 px-4 py-2 text-xs font-bold uppercase disabled:opacity-50"
                style={{ background: "var(--accent)", color: "white" }}>
                {saving ? "Sauvegarde…" : "Sauvegarder"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ── Onglet Outils ──────────────────────────────────────────────────────────

function ToolsTab({ token }: { token: string }) {
  const today = new Date().toISOString().slice(0, 10);
  const [detectDateFrom, setDetectDateFrom] = useState(today);
  const [detectDateTo, setDetectDateTo]     = useState(today);
  const [detectChannel, setDetectChannel] = useState("");
  const [detectStatus, setDetectStatus]   = useState<"idle"|"loading"|"ok"|"err">("idle");
  const [detectMsg, setDetectMsg]         = useState("");
  const [refreshStatus, setRefreshStatus]         = useState<"idle"|"loading"|"ok"|"err">("idle");
  const [refreshMsg, setRefreshMsg]               = useState("");
  const [missingStatus, setMissingStatus]         = useState<"idle"|"loading"|"ok"|"err">("idle");
  const [missingMsg, setMissingMsg]               = useState("");
  const [durStatus, setDurStatus]                 = useState<"idle"|"loading"|"ok"|"err">("idle");
  const [durMsg, setDurMsg]                       = useState("");
  const [channelsList, setChannelsList]   = useState<string[]>([]);

  useEffect(() => {
    fetch(`${API_URL}/api/channels`)
      .then((r) => r.json())
      .then((data: { name: string }[]) => setChannelsList(data.map((c) => c.name)))
      .catch(() => {});
  }, []);

  async function doRefreshMissing() {
    if (!confirm("Récupérer les vues pour toutes les matinales sans snapshot (pas de limite de date) ?")) return;
    setMissingStatus("loading"); setMissingMsg("");
    try {
      const r = await fetch(`${API_URL}/api/admin/refresh-missing`, {
        method: "POST", headers: authHeaders(token),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setMissingStatus("ok");
      setMissingMsg(`✓ ${data.message}`);
    } catch (e: unknown) {
      setMissingStatus("err");
      setMissingMsg(`✗ ${e instanceof Error ? e.message : "Erreur inconnue"}`);
    }
  }

  async function doRefreshDurations() {
    if (!confirm("Récupérer les durées manquantes (matinales détectées en live) ?")) return;
    setDurStatus("loading"); setDurMsg("");
    try {
      const r = await fetch(`${API_URL}/api/admin/refresh-durations`, {
        method: "POST", headers: authHeaders(token),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setDurStatus("ok");
      setDurMsg(`✓ ${data.message}`);
    } catch (e: unknown) {
      setDurStatus("err");
      setDurMsg(`✗ ${e instanceof Error ? e.message : "Erreur inconnue"}`);
    }
  }

  async function doRefreshNow() {
    if (!confirm("Déclencher un refresh immédiat des vues (bypass plage horaire) ?")) return;
    setRefreshStatus("loading"); setRefreshMsg("");
    try {
      const r = await fetch(`${API_URL}/api/admin/refresh-now`, {
        method: "POST", headers: authHeaders(token),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setRefreshStatus("ok");
      setRefreshMsg(`✓ ${data.message} (today: ${data.refresh_today}, smart: ${data.refresh_smart})`);
    } catch (e: unknown) {
      setRefreshStatus("err");
      setRefreshMsg(`✗ ${e instanceof Error ? e.message : "Erreur inconnue"}`);
    }
  }

  async function doDetect(e: React.FormEvent) {
    e.preventDefault();
    setDetectStatus("loading"); setDetectMsg("");
    try {
      const r = await fetch(`${API_URL}/api/admin/detect`, {
        method:  "POST",
        headers: authHeaders(token),
        body:    JSON.stringify({
          date_from: detectDateFrom,
          date_to:   detectDateTo || null,
          channel:   detectChannel || null,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail);
      setDetectStatus("ok");
      setDetectMsg(`✓ ${data.message}`);
    } catch (e: unknown) {
      setDetectStatus("err");
      setDetectMsg(`✗ ${e instanceof Error ? e.message : "Erreur inconnue"}`);
    }
  }

  return (
    <div className="flex flex-col gap-6">

      {/* Refresh vues manquantes */}
      <div style={{ border: "1px solid #1565c0", padding: "20px 24px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Vues manquantes — initialisation historique
        </p>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Récupère les vues YouTube pour toutes les matinales qui n&apos;ont <strong>aucun snapshot</strong>, sans limite de date.
          Idéal après un backfill ou l&apos;ajout d&apos;une nouvelle chaîne.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={doRefreshMissing}
            disabled={missingStatus === "loading"}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-opacity hover:opacity-80"
            style={{ background: "#1565c0", color: "white" }}>
            {missingStatus === "loading" ? "Récupération en cours…" : "↓ Récupérer les vues manquantes"}
          </button>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Une requête YouTube par tranche de 50 vidéos.
          </span>
        </div>
        {missingMsg && (
          <p className="text-xs mt-3 px-1" style={{ color: missingStatus === "ok" ? "#1565c0" : "var(--accent)" }}>
            {missingMsg}
          </p>
        )}
      </div>

      {/* Durées manquantes */}
      <div style={{ border: "1px solid #7b1fa2", padding: "20px 24px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Durées manquantes — FIN et DURÉE absentes
        </p>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Récupère la durée réelle pour les matinales avec <strong>FIN / DURÉE = —</strong>.
          Cause : vidéos capturées pendant le live (YouTube retourne P0D), puis terminées.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={doRefreshDurations}
            disabled={durStatus === "loading"}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-opacity hover:opacity-80"
            style={{ background: "#7b1fa2", color: "white" }}>
            {durStatus === "loading" ? "Récupération en cours…" : "⏱ Récupérer les durées manquantes"}
          </button>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            1 appel YouTube par tranche de 50 vidéos (contentDetails uniquement).
          </span>
        </div>
        {durMsg && (
          <p className="text-xs mt-3 px-1" style={{ color: durStatus === "ok" ? "#7b1fa2" : "var(--accent)" }}>
            {durMsg}
          </p>
        )}
      </div>

      {/* Refresh manuel */}
      <div style={{ border: "1px solid #2e7d32", padding: "20px 24px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Tester le refresh des vues
        </p>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Déclenche immédiatement les boucles <strong>Refresh J0</strong> et <strong>Refresh Smart</strong> sans tenir compte de la plage horaire ni du jour. Utile pour vérifier que le système fonctionne après un nouveau déploiement.
        </p>
        <div className="flex items-center gap-4 flex-wrap">
          <button
            onClick={doRefreshNow}
            disabled={refreshStatus === "loading"}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-opacity hover:opacity-80"
            style={{ background: "#2e7d32", color: "white" }}>
            {refreshStatus === "loading" ? "Refresh en cours…" : "▶ Refresh maintenant"}
          </button>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Nécessite au moins une matinale en base pour aujourd'hui.
          </span>
        </div>
        {refreshMsg && (
          <p className="text-xs mt-3 px-1" style={{ color: refreshStatus === "ok" ? "#2e7d32" : "var(--accent)" }}>
            {refreshMsg}
          </p>
        )}
      </div>

      {/* Détection par date */}
      <div style={{ border: "1px solid var(--border)", padding: "20px 24px" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Lancer une détection manuelle
        </p>
        <p className="text-xs mb-5" style={{ color: "var(--text-muted)" }}>
          Lance une détection immédiate sur une plage de dates, directement sur Railway (même code que la boucle automatique).
          Utile pour rattraper un jour manqué, une chaîne récemment ajoutée sur plusieurs mois, ou forcer une re-détection sans attendre la prochaine boucle.
        </p>

        <form onSubmit={doDetect} className="flex flex-wrap items-end gap-4">
          {/* Date de début */}
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: "var(--text-muted)" }}>
              Du *
            </label>
            <input
              type="date"
              value={detectDateFrom}
              max={detectDateTo || today}
              onChange={(e) => { setDetectDateFrom(e.target.value); setDetectStatus("idle"); setDetectMsg(""); }}
              required
              className="text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
            />
          </div>

          {/* Date de fin */}
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: "var(--text-muted)" }}>
              Au *
            </label>
            <input
              type="date"
              value={detectDateTo}
              min={detectDateFrom}
              max={today}
              onChange={(e) => { setDetectDateTo(e.target.value); setDetectStatus("idle"); setDetectMsg(""); }}
              required
              className="text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit" }}
            />
          </div>

          {/* Filtre chaîne (optionnel) */}
          <div>
            <label className="text-xs font-bold block mb-1.5" style={{ color: "var(--text-muted)" }}>
              Chaîne (optionnel — toutes si vide)
            </label>
            <select
              value={detectChannel}
              onChange={(e) => setDetectChannel(e.target.value)}
              className="text-xs p-2 outline-none"
              style={{ border: "1px solid var(--border)", background: "var(--bg)", color: "var(--ink)", fontFamily: "inherit", minWidth: 180 }}
            >
              <option value="">— Toutes les chaînes —</option>
              {channelsList.map((ch) => (
                <option key={ch} value={ch}>{ch}</option>
              ))}
            </select>
          </div>

          {/* Bouton */}
          <button
            type="submit"
            disabled={detectStatus === "loading"}
            className="px-5 py-2 text-xs font-bold uppercase tracking-wider disabled:opacity-50 transition-opacity hover:opacity-80"
            style={{ background: "var(--ink)", color: "white" }}>
            {detectStatus === "loading" ? "Lancement…" : "▶ Lancer"}
          </button>
        </form>

        {/* Feedback */}
        {detectMsg && (
          <p className="text-xs mt-4 px-1" style={{ color: detectStatus === "ok" ? "#2e7d32" : "var(--accent)" }}>
            {detectMsg}
          </p>
        )}
      </div>

      {/* Info architecture */}
      <div style={{ border: "1px solid var(--border)", padding: "16px 20px", background: "var(--surface2)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Architecture de détection
        </p>
        <div className="flex flex-col gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          <p>
            <span className="font-bold" style={{ color: "var(--ink)" }}>Détection automatique</span>
            {" "}— assurée par les boucles Railway (<code style={{ background: "var(--surface)", padding: "1px 5px" }}>_detect_loop</code> et <code style={{ background: "var(--surface)", padding: "1px 5px" }}>_detect_live_loop</code> dans <code style={{ background: "var(--surface)", padding: "1px 5px" }}>api/main.py</code>). Fiable, sans dépendance GitHub Actions.
          </p>
          <p>
            <span className="font-bold" style={{ color: "var(--ink)" }}>Détection manuelle</span>
            {" "}— via ce formulaire, exécutée directement sur Railway (même fonction que les boucles automatiques). Aucune dépendance à GitHub Actions.
          </p>
          <p className="mt-1" style={{ opacity: 0.7 }}>
            Variable Railway requise : <strong>YOUTUBE_API_KEY</strong>.
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Onglet Règles & Crons ──────────────────────────────────────────────────

const RAILWAY_LOOPS = [
  {
    label: "Détection matinales",
    schedule: "Toutes les 30 min",
    hours: "5h00 – 13h00 UTC",
    days: "Lun – Ven",
    description: "Scanne la playlist YouTube de chaque chaîne et insère les nouvelles matinales terminées en base. Remplace le workflow detect.yml (migré depuis GitHub Actions pour fiabilité).",
  },
  {
    label: "Détection lives en cours",
    schedule: "Toutes les 30 min",
    hours: "6h00 – 10h00 UTC",
    days: "Lun – Ven",
    description: "Détecte les matinales actuellement en live via search.list avant qu'elles soient terminées. Coût : ~100 unités YouTube/chaîne. Remplace detect-live.yml.",
  },
  {
    label: "Refresh vues J0",
    schedule: "Toutes les 15 min",
    hours: "5h00 – 14h00 UTC",
    days: "Lun – Ven",
    description: "Met à jour le compteur de vues des matinales d'aujourd'hui en temps quasi-réel.",
  },
  {
    label: "Refresh vues (smart)",
    schedule: "Toutes les 30 min",
    hours: "5h00 – 14h00 UTC",
    days: "Lun – Ven",
    description: "J0–J3 : refresh si > 6h · J4–J30 : refresh si > 24h · J31+ : ignoré.",
  },
  {
    label: "Durées manquantes",
    schedule: "Toutes les heures",
    hours: "En continu",
    days: "Tous les jours",
    description: "Récupère la durée réelle des matinales capturées pendant le live (YouTube retourne P0D en cours de diffusion). S'arrête automatiquement quand tout est renseigné.",
  },
  {
    label: "Rapport email quotidien",
    schedule: "1 fois / jour",
    hours: "16h00 UTC",
    days: "Lun – Ven",
    description: "Envoie le rapport de vues du jour à tous les abonnés actifs via Resend.",
  },
];

const GITHUB_CRONS = [
  {
    workflow: "detect.yml",
    label: "Détection matinales (backup)",
    schedule: "Manuel uniquement",
    hours: "—",
    days: "—",
    command: "python main.py detect 1",
    description: "⚠ Schedule désactivé — migré vers la boucle Railway pour éviter les retards GitHub Actions (jusqu'à 4h sur plan gratuit). Disponible en workflow_dispatch pour forcer une re-détection ou un backfill ponctuel.",
  },
  {
    workflow: "detect-live.yml",
    label: "Détection lives (backup)",
    schedule: "Manuel uniquement",
    hours: "—",
    days: "—",
    command: "python main.py detect_live",
    description: "⚠ Schedule désactivé — migré vers la boucle Railway. Disponible en workflow_dispatch pour les tests manuels.",
  },
  {
    workflow: "sync.yml",
    label: "Sync historique (backfill)",
    schedule: "Manuel uniquement",
    hours: "—",
    days: "—",
    command: "python main.py sync N",
    description: "Resynchronise les N derniers jours pour toutes les chaînes (ou une seule). Déclenché depuis l'onglet Outils.",
  },
  {
    workflow: "report.yml",
    label: "Rapport email (backup)",
    schedule: "Manuel uniquement",
    hours: "—",
    days: "—",
    command: "python main.py report_today",
    description: "Envoi manuel du rapport. Le rapport automatique quotidien est géré par la boucle Railway à 16h00 UTC.",
  },
];

const CHANNEL_RULES = [
  { name: "TFM",            start: "07:00", end: "11:00", hints: ["infos matin"] },
  { name: "RTS",            start: "07:30", end: "11:00", hints: ["kenkelibaa", "kenkeliba"] },
  { name: "2STV",           start: "07:00", end: "10:30", hints: ["matin bonheur"] },
  { name: "Sen TV",         start: "07:30", end: "11:00", hints: ["bloc matinale", "bloc matin"] },
  { name: "Walf TV",        start: "07:00", end: "10:30", hints: ["votre matinale", "r'eveil", "réveil", "reveil"] },
  { name: "Solo Media Group", start: "07:30", end: "11:00", hints: ["la matinale d'infos", "matinale d'infos", "matinale infos"] },
  { name: "Xalaat TV",      start: "07:00", end: "11:00", hints: ["lu xew tay"] },
  { name: "Solution TV",    start: "07:00", end: "11:00", hints: [] },
  { name: "Sans Limites TV", start: "07:30", end: "11:00", hints: ["café actu", "cafe actu"] },
  { name: "Seneweb TV",     start: "08:00", end: "12:00", hints: ["matinale.sn", "matinale sn"] },
  { name: "Eric Favre TV", start: "07:00", end: "11:00", hints: [] },
];

function RulesTab() {
  return (
    <div className="flex flex-col gap-8">

      {/* Boucles Railway (background) */}
      <div>
        <div className="flex items-center gap-3 mb-4">
          <p className="text-xs font-bold uppercase tracking-widest"
            style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
            Planification — Railway
          </p>
          <span className="text-xs font-bold px-2 py-0.5" style={{ background: "#2e7d32", color: "white" }}>
            ● Actif en permanence
          </span>
        </div>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Ces tâches tournent en boucle dans le process FastAPI (asyncio). Elles démarrent automatiquement au lancement de Railway et ne nécessitent aucune action externe.
        </p>
        <div className="flex flex-col gap-3">
          {RAILWAY_LOOPS.map((c) => (
            <div key={c.label} style={{ border: "1px solid #2e7d32", padding: "14px 18px" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5"
                      style={{ background: "var(--ink)", color: "white" }}>
                      {c.schedule}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{c.label}</span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--text-muted)" }}>{c.description}</p>
                </div>
                <div className="flex flex-col gap-1 text-right flex-shrink-0">
                  <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{c.hours}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{c.days}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Crons GitHub Actions */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Planification — GitHub Actions
        </p>
        <div className="flex flex-col gap-3">
          {GITHUB_CRONS.map((c) => (
            <div key={c.workflow} style={{ border: "1px solid var(--border)", padding: "14px 18px" }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold px-2 py-0.5"
                      style={{ background: c.schedule === "Manuel uniquement" ? "var(--surface2)" : "var(--ink)", color: c.schedule === "Manuel uniquement" ? "var(--text-muted)" : "white" }}>
                      {c.schedule}
                    </span>
                    <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>{c.label}</span>
                  </div>
                  <p className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>{c.description}</p>
                  <code className="text-xs px-2 py-0.5" style={{ background: "var(--surface2)", color: "var(--ink)", fontFamily: "monospace" }}>
                    {c.command}
                  </code>
                </div>
                <div className="flex flex-col gap-1 text-right flex-shrink-0">
                  <span className="text-xs font-semibold" style={{ color: "var(--ink)" }}>{c.hours}</span>
                  <span className="text-xs" style={{ color: "var(--text-muted)" }}>{c.days}</span>
                  <span className="text-xs font-mono" style={{ color: "var(--text-muted)", opacity: 0.6 }}>{c.workflow}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Règles de détection par chaîne */}
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-2"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Règles de détection par chaîne
        </p>
        <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>
          Tolérance ±30 min appliquée automatiquement sur chaque fenêtre horaire. Semaines uniquement (sam/dim ignorés), jours fériés sénégalais exclus.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                {["Chaîne", "Fenêtre horaire UTC", "Filtre titre (title_hints)", "Mode si aucun hint"].map((h) => (
                  <th key={h} className="px-3 py-2 text-left font-bold uppercase tracking-wider"
                    style={{ color: "var(--text-muted)", letterSpacing: "0.08em", whiteSpace: "nowrap" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CHANNEL_RULES.map((ch, i) => (
                <tr key={ch.name} style={{ borderBottom: "1px solid var(--border)", background: i % 2 === 0 ? "var(--surface)" : "var(--surface2)" }}>
                  <td className="px-3 py-2 font-bold whitespace-nowrap" style={{ color: "var(--ink)" }}>
                    {ch.name}
                  </td>
                  <td className="px-3 py-2 font-mono whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                    {ch.start} – {ch.end}
                    <span className="ml-1 text-xs" style={{ color: "var(--text-muted)", opacity: 0.6 }}>
                      (± 30 min)
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {ch.hints.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {ch.hints.map((h) => (
                          <span key={h} className="px-1.5 py-0.5 font-mono"
                            style={{ background: "var(--ink)", color: "white", fontSize: 10 }}>
                            {h}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs" style={{ color: ch.hints.length === 0 ? "#2e7d32" : "var(--text-muted)", fontStyle: ch.hints.length === 0 ? "normal" : "italic" }}>
                    {ch.hints.length === 0 ? "✓ Fenêtre horaire uniquement" : "N/A (hint actif)"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Règles générales */}
      <div style={{ border: "1px solid var(--border)", padding: "16px 20px", background: "var(--surface2)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-3"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Filtres communs à toutes les chaînes
        </p>
        <div className="flex flex-col gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
          {[
            ["Type de contenu", "Uniquement les lives terminés (liveStreamingDetails présent)"],
            ["Durée minimale", "≥ 20 minutes — élimine les courts clips et bandes-annonces"],
            ["Jours ignorés", "Samedis, dimanches, jours fériés sénégalais, jours exclus manuellement"],
            ["Doublon", "1 seule matinale par chaîne par jour — la première détectée est conservée"],
            ["Fenêtre globale", "4h00 – 13h00 UTC (filtre large avant le filtre par chaîne)"],
          ].map(([label, value]) => (
            <div key={label} className="flex gap-3">
              <span className="font-bold flex-shrink-0" style={{ color: "var(--ink)", minWidth: 140 }}>{label}</span>
              <span>{value}</span>
            </div>
          ))}
        </div>
      </div>

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

  // Lit le token depuis localStorage et le valide contre l'API
  useEffect(() => {
    const t = localStorage.getItem("adminToken");
    if (!t) return;
    // Validation silencieuse — si le token est rejeté, on efface et on redemande
    fetch(`${API_URL}/api/admin/reports?status=pending`, {
      headers: { "X-Admin-Token": t },
    }).then((r) => {
      if (r.ok) {
        setToken(t);
      } else {
        localStorage.removeItem("adminToken");
      }
    }).catch(() => {
      // API injoignable → on garde le token, on réessaiera au prochain chargement
      setToken(t);
    });
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
      localStorage.setItem("adminToken", t);
      setToken(t);
    } finally { setLogging(false); }
  }

  function handleLogout() {
    localStorage.removeItem("adminToken");
    setToken(null);
  }

  const TABS: { key: Tab; label: string; badge?: number }[] = [
    { key: "reports",     label: "Signalements", badge: reportCount },
    { key: "matinales",   label: "Matinales"                        },
    { key: "channels",    label: "Chaînes"                          },
    { key: "excluded",    label: "Jours exclus"                     },
    { key: "subscribers", label: "Abonnés email"                    },
    { key: "tools",       label: "Outils"                           },
    { key: "rules",       label: "Règles & Crons"                   },
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
        {tab === "reports"     && <ReportsTab      token={token} />}
        {tab === "matinales"   && <MatinalesTab    token={token} />}
        {tab === "channels"    && <ChannelsTab     token={token} />}
        {tab === "excluded"    && <ExcludedDaysTab token={token} />}
        {tab === "subscribers" && <SubscribersTab  token={token} />}
        {tab === "tools"       && <ToolsTab        token={token} />}
        {tab === "rules"       && <RulesTab                      />}
      </main>
    </div>
  );
}
