"use client";
import { useState, useCallback, useEffect } from "react";
import useSWR from "swr";
import ReportModal from "@/components/ReportModal";
import { Matinale } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Types ──────────────────────────────────────────────────────────────────

interface MatinaleRow {
  id: number;
  channel: string;
  title: string | null;
  published_at: string;
  duration_seconds: number | null;
  debut: string | null;
  fin: string | null;
  duree: string | null;
  view_count: number | null;
  like_count: number | null;
  youtube_url: string;
}

interface SearchResult {
  items: MatinaleRow[];
  total: number;
  total_views: number;
  page: number;
  page_size: number;
  pages: number;
}

interface Channel { id: number; name: string; }

// ── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number | null) {
  if (n == null) return "—";
  return n >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `${Math.round(n / 1_000)}k`
    : String(n);
}

function buildParams(filters: Filters, page: number, page_size = 50) {
  const p = new URLSearchParams({ page: String(page), page_size: String(page_size) });
  if (filters.search)       p.set("search", filters.search);
  if (filters.channels.length) p.set("channels", filters.channels.join(","));
  if (filters.date_from)    p.set("date_from", filters.date_from);
  if (filters.date_to)      p.set("date_to", filters.date_to);
  if (filters.min_duration) p.set("min_duration", String(filters.min_duration * 60));
  if (filters.min_views)    p.set("min_views", String(filters.min_views));
  return p.toString();
}

// ── CSV Export ─────────────────────────────────────────────────────────────

async function exportCSV(filters: Filters, total: number) {
  // Fetch all results (max 2000) for export
  const p = buildParams(filters, 1, Math.min(total, 2000));
  const r = await fetch(`${API_URL}/api/matinales/search?${p}`);
  const data: SearchResult = await r.json();

  const header = ["Date", "Chaîne", "Titre", "Début", "Fin", "Durée (min)", "Vues", "Likes", "URL YouTube"];
  const rows = data.items.map((m) => [
    new Date(m.published_at).toLocaleDateString("fr-FR"),
    m.channel,
    `"${(m.title ?? "").replace(/"/g, '""')}"`,
    m.debut ?? "",
    m.fin ?? "",
    m.duration_seconds ? Math.round(m.duration_seconds / 60) : "",
    m.view_count ?? "",
    m.like_count ?? "",
    m.youtube_url,
  ]);

  const csv = [header, ...rows].map((r) => r.join(";")).join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  a.download = `mediapulse_matinales_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Filtres ────────────────────────────────────────────────────────────────

interface Filters {
  search:       string;
  channels:     string[];
  date_from:    string;
  date_to:      string;
  min_duration: number | null;  // minutes
  min_views:    number | null;
}

const DEFAULT_FILTERS: Filters = {
  search:       "",
  channels:     [],
  date_from:    "",
  date_to:      "",
  min_duration: null,
  min_views:    null,
};

// ── Composant filtre ───────────────────────────────────────────────────────

function FilterBar({
  filters, channels, onChange,
}: {
  filters: Filters;
  channels: Channel[];
  onChange: (f: Filters) => void;
}) {
  function set<K extends keyof Filters>(key: K, val: Filters[K]) {
    onChange({ ...filters, [key]: val });
  }

  function toggleChannel(name: string) {
    const next = filters.channels.includes(name)
      ? filters.channels.filter((c) => c !== name)
      : [...filters.channels, name];
    set("channels", next);
  }

  const inputStyle = {
    border: "1px solid var(--border)", background: "var(--bg)",
    color: "var(--ink)", fontFamily: "inherit", fontSize: 12,
    padding: "6px 8px", outline: "none",
  };

  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="px-5 py-4" style={{ borderBottom: "1px solid var(--border)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-4"
          style={{ color: "var(--text-muted)", letterSpacing: "0.15em" }}>
          Filtres
        </p>

        {/* Ligne 0 : raccourcis années */}
        {(() => {
          const currentYear = new Date().getFullYear();
          const years = Array.from({ length: currentYear - 2024 + 1 }, (_, i) => 2024 + i);
          const yearColors: Record<number, string> = { 2024: "#7a736a", 2025: "#4a4440", 2026: "var(--accent)" };
          const activeYear = years.find((y) =>
            filters.date_from === `${y}-01-01` &&
            (filters.date_to === `${y}-12-31` || (y === currentYear && filters.date_to === ""))
          );
          return (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold uppercase tracking-widest"
                style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>Année</span>
              {years.map((y) => {
                const col = yearColors[y] ?? "var(--ink)";
                const isActive = activeYear === y;
                return (
                  <button key={y}
                    onClick={() => onChange({
                      ...filters,
                      date_from: `${y}-01-01`,
                      date_to: y === currentYear ? "" : `${y}-12-31`,
                    })}
                    className="text-xs font-bold px-3 py-1"
                    style={{
                      background: isActive ? col : "transparent",
                      color:      isActive ? "white" : col,
                      border:     `1px solid ${col}`,
                    }}>
                    {y}
                  </button>
                );
              })}
            </div>
          );
        })()}

        {/* Ligne 1 : recherche + dates */}
        <div className="flex flex-wrap gap-3 mb-3">
          <input
            type="text"
            value={filters.search}
            onChange={(e) => set("search", e.target.value)}
            placeholder="Rechercher dans le titre…"
            style={{ ...inputStyle, flexGrow: 1, minWidth: 200 }}
          />
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Du</span>
            <input type="date" value={filters.date_from}
              onChange={(e) => set("date_from", e.target.value)}
              style={{ ...inputStyle }} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>au</span>
            <input type="date" value={filters.date_to}
              onChange={(e) => set("date_to", e.target.value)}
              style={{ ...inputStyle }} />
          </div>
        </div>

        {/* Ligne 2 : chaînes + durée + vues */}
        <div className="flex flex-wrap gap-4 items-center">
          {/* Chaînes */}
          <div className="flex flex-wrap gap-1">
            {channels.map((c) => {
              const active = filters.channels.includes(c.name);
              return (
                <button key={c.id} onClick={() => toggleChannel(c.name)}
                  className="text-xs font-semibold px-2 py-1 transition-all"
                  style={{
                    background: active ? "var(--ink)" : "transparent",
                    color:      active ? "white"      : "var(--text-muted)",
                    border:     "1px solid var(--border)",
                  }}>
                  {c.name}
                </button>
              );
            })}
          </div>

          <div style={{ width: 1, height: 20, background: "var(--border)" }} />

          {/* Durée min */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Durée ≥</span>
            <select value={filters.min_duration ?? ""}
              onChange={(e) => set("min_duration", e.target.value ? Number(e.target.value) : null)}
              style={{ ...inputStyle }}>
              <option value="">Toutes</option>
              <option value="30">30 min</option>
              <option value="60">1h</option>
              <option value="90">1h30</option>
              <option value="120">2h</option>
            </select>
          </div>

          {/* Vues min */}
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>Vues ≥</span>
            <select value={filters.min_views ?? ""}
              onChange={(e) => set("min_views", e.target.value ? Number(e.target.value) : null)}
              style={{ ...inputStyle }}>
              <option value="">Toutes</option>
              <option value="1000">1k</option>
              <option value="5000">5k</option>
              <option value="10000">10k</option>
              <option value="50000">50k</option>
            </select>
          </div>

          {/* Reset */}
          {JSON.stringify(filters) !== JSON.stringify(DEFAULT_FILTERS) && (
            <button onClick={() => onChange(DEFAULT_FILTERS)}
              className="text-xs font-semibold"
              style={{ color: "var(--accent)", textDecoration: "underline" }}>
              Réinitialiser
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────

function Pagination({ page, pages, onChange }: {
  page: number; pages: number; onChange: (p: number) => void;
}) {
  if (pages <= 1) return null;

  const nums: (number | "…")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 2) {
      nums.push(i);
    } else if (nums[nums.length - 1] !== "…") {
      nums.push("…");
    }
  }

  return (
    <div className="flex items-center justify-center gap-1 py-4">
      <button onClick={() => onChange(page - 1)} disabled={page <= 1}
        className="px-3 py-1 text-xs font-semibold disabled:opacity-30"
        style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        ←
      </button>
      {nums.map((n, i) =>
        n === "…"
          ? <span key={`e${i}`} className="px-2 text-xs" style={{ color: "var(--text-muted)" }}>…</span>
          : <button key={n} onClick={() => onChange(n as number)}
              className="px-3 py-1 text-xs font-semibold"
              style={{
                background: page === n ? "var(--ink)" : "transparent",
                color:      page === n ? "white"      : "var(--text-muted)",
                border:     "1px solid var(--border)",
              }}>
              {n}
            </button>
      )}
      <button onClick={() => onChange(page + 1)} disabled={page >= pages}
        className="px-3 py-1 text-xs font-semibold disabled:opacity-30"
        style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}>
        →
      </button>
    </div>
  );
}

// ── Tooltip jour notable (exclu = rouge, fête info = orange) ─────────────

function SpecialDateCell({
  isoDate, reason, skipCollection,
}: {
  isoDate: string;
  reason: string;
  skipCollection: boolean;
}) {
  const [show, setShow] = useState(false);
  const label  = new Date(isoDate).toLocaleDateString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const color  = skipCollection ? "var(--accent)" : "#f59e0b";   // rouge ou orange
  const icon   = skipCollection ? "🔴" : "🟠";

  return (
    <span
      style={{ position: "relative", display: "inline-block" }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <span style={{
        color,
        borderBottom: "1px dashed currentColor",
        cursor:       "default",
        fontFamily:   "monospace",
        fontSize:     12,
        fontWeight:   600,
      }}>
        {label}
      </span>
      {show && (
        <span style={{
          position:      "absolute",
          bottom:        "calc(100% + 6px)",
          left:          "50%",
          transform:     "translateX(-50%)",
          background:    "var(--ink)",
          color:         "white",
          padding:       "5px 10px",
          fontSize:      11,
          whiteSpace:    "nowrap",
          pointerEvents: "none",
          zIndex:        50,
          fontWeight:    600,
          letterSpacing: "0.04em",
        }}>
          {icon} {label.slice(0, 5)} · {reason}
        </span>
      )}
    </span>
  );
}

// ── Page principale ────────────────────────────────────────────────────────

export default function MatinalesPage() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [page, setPage]       = useState(1);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [exporting, setExporting] = useState(false);
  const [reporting, setReporting] = useState<Matinale | null>(null);
  const [specialDays, setSpecialDays] = useState<
    Record<string, { reason: string; skip_collection: boolean }>
  >({});

  // Charge les chaînes une fois
  useEffect(() => {
    fetch(`${API_URL}/api/channels`)
      .then((r) => r.json())
      .then(setChannels)
      .catch(() => {});
  }, []);

  // Charge les jours spéciaux (jours exclus + fêtes info)
  useEffect(() => {
    fetch(`${API_URL}/api/events`)
      .then((r) => r.json())
      .then((events: { date: string; reason: string; skip_collection: boolean }[]) => {
        const map: Record<string, { reason: string; skip_collection: boolean }> = {};
        for (const e of events) map[e.date] = { reason: e.reason, skip_collection: e.skip_collection ?? true };
        setSpecialDays(map);
      })
      .catch(() => {});
  }, []);

  // Reset page à 1 quand les filtres changent
  const handleFilters = useCallback((f: Filters) => {
    setFilters(f);
    setPage(1);
  }, []);

  const swrKey = `${API_URL}/api/matinales/search?${buildParams(filters, page)}`;
  const { data, isLoading } = useSWR<SearchResult>(swrKey, (url: string) =>
    fetch(url).then((r) => r.json()),
    { dedupingInterval: 60_000, revalidateOnFocus: false }
  );

  async function handleExport() {
    if (!data) return;
    setExporting(true);
    try { await exportCSV(filters, data.total); }
    finally { setExporting(false); }
  }

  return (
    <div className="min-h-screen" style={{ background: "var(--bg)" }}>
      <div style={{ background: "var(--accent)", height: 4 }} />

      {/* Header */}
      <header style={{ background: "var(--surface)", borderBottom: "2px solid var(--ink)" }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-end justify-between">
          <div>
            <h1 className="font-display font-bold leading-none tracking-tight"
              style={{ fontSize: 36, color: "var(--ink)", fontWeight: 900 }}>
              MEDIAPULSE
            </h1>
            <p className="text-xs font-bold uppercase tracking-widest mt-1"
              style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}>
              Base complète · Matinales
            </p>
          </div>
          <a href="/dashboard" className="text-xs font-semibold"
            style={{ color: "var(--text-muted)", textDecoration: "none" }}>
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* Filtres */}
        <div className="mb-4">
          <FilterBar filters={filters} channels={channels} onChange={handleFilters} />
        </div>

        {/* Bandeau stats + export */}
        <div className="flex items-center justify-between mb-4 px-1">
          <div className="flex items-center gap-6">
            {data && (
              <>
                <span className="text-sm font-bold" style={{ color: "var(--ink)" }}>
                  {data.total.toLocaleString("fr-FR")} matinale{data.total > 1 ? "s" : ""}
                </span>
                {data.total_views > 0 && (
                  <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {fmt(data.total_views)} vues cumulées
                  </span>
                )}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Page {data.page}/{data.pages}
                </span>
              </>
            )}
            {isLoading && (
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>Chargement…</span>
            )}
          </div>
          <button onClick={handleExport} disabled={!data || exporting || data.total === 0}
            className="text-xs font-bold uppercase tracking-wider px-4 py-2 disabled:opacity-40 transition-opacity hover:opacity-70"
            style={{ border: "1px solid var(--ink)", color: "var(--ink)" }}>
            {exporting ? "Export…" : "↓ Export CSV"}
          </button>
        </div>

        {/* Tableau */}
        <div style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ background: "var(--surface2)", borderBottom: "1px solid var(--border)" }}>
                  {["Date", "Chaîne", "Titre", "Début", "Fin", "Durée", "Vues", "Likes", ""].map((h) => (
                    <th key={h} className="px-4 py-2.5 text-left text-xs font-bold uppercase"
                      style={{ color: "var(--text-muted)", letterSpacing: "0.1em", whiteSpace: "nowrap" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-xs"
                      style={{ color: "var(--text-muted)" }}>
                      Chargement…
                    </td>
                  </tr>
                )}
                {!isLoading && data?.items.length === 0 && (
                  <tr>
                    <td colSpan={9} className="px-4 py-8 text-center text-sm"
                      style={{ color: "var(--text-muted)" }}>
                      Aucune matinale ne correspond aux filtres sélectionnés.
                    </td>
                  </tr>
                )}
                {data?.items.map((m, i) => {
                  const dateStr   = m.published_at.slice(0, 10);
                  const special   = specialDays[dateStr];
                  return (
                  <tr key={m.id}
                    style={{
                      borderBottom: "1px solid var(--border)",
                      background:   i % 2 === 0 ? "var(--surface)" : "var(--surface2)",
                    }}
                    className="hover:opacity-75 transition-opacity">
                    <td className="px-4 py-3 whitespace-nowrap text-xs font-mono"
                      style={{ color: "var(--text-muted)" }}>
                      {special
                        ? <SpecialDateCell isoDate={m.published_at} reason={special.reason} skipCollection={special.skip_collection} />
                        : new Date(m.published_at).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-bold px-2 py-0.5"
                        style={{ background: "var(--ink)", color: "white" }}>
                        {m.channel}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs max-w-xs truncate"
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
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <a href={m.youtube_url} target="_blank" rel="noopener noreferrer"
                          className="text-xs font-bold uppercase tracking-wider hover:opacity-70"
                          style={{ color: "var(--accent)", textDecoration: "none", letterSpacing: "0.05em" }}>
                          ▶ voir
                        </a>
                        <button
                          onClick={() => setReporting(m as unknown as Matinale)}
                          className="text-xs font-semibold uppercase tracking-wider hover:opacity-70"
                          style={{ color: "var(--text-muted)", letterSpacing: "0.05em" }}
                          title="Signaler un problème avec cette vidéo">
                          ⚑ signaler
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {data && data.pages > 1 && (
            <div style={{ borderTop: "1px solid var(--border)" }}>
              <Pagination page={data.page} pages={data.pages} onChange={setPage} />
            </div>
          )}
        </div>

      </main>

      <footer className="max-w-7xl mx-auto px-6 py-6 mt-4"
        style={{ borderTop: "1px solid var(--border)" }}>
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          MediaPulse · Données YouTube · Sync automatique lun–ven 6h–12h (UTC)
        </p>
      </footer>

      {/* Modal signalement */}
      {reporting && (
        <ReportModal matinale={reporting} onClose={() => setReporting(null)} />
      )}
    </div>
  );
}
