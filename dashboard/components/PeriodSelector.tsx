"use client";

export interface Period {
  days: number;
  year: number | null;
}

const DAYS_OPTIONS = [
  { label: "7 j",    days: 7   },
  { label: "30 j",   days: 30  },
  { label: "60 j",   days: 60  },
  { label: "6 mois", days: 180 },
];

// Années disponibles dynamiquement (de 2024 à l'année courante)
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from(
  { length: CURRENT_YEAR - 2024 + 1 },
  (_, i) => 2024 + i
);

interface Props {
  value: Period;
  onChange: (p: Period) => void;
}

export default function PeriodSelector({ value, onChange }: Props) {
  const btnBase: React.CSSProperties = {
    border: "1px solid var(--border)",
    fontSize: 12,
    fontWeight: 700,
    padding: "4px 10px",
    cursor: "pointer",
    transition: "all 0.1s",
    fontFamily: "inherit",
  };

  function activeStyle(active: boolean): React.CSSProperties {
    return {
      ...btnBase,
      background: active ? "var(--ink)" : "transparent",
      color:      active ? "white"      : "var(--text-muted)",
    };
  }

  function activeYearStyle(active: boolean, year: number): React.CSSProperties {
    // Couleur d'accent par année pour les distinguer visuellement
    const yearColors: Record<number, string> = {
      2024: "#7a736a",
      2025: "#4a4440",
      2026: "var(--accent)",
    };
    const col = yearColors[year] ?? "var(--ink)";
    return {
      ...btnBase,
      background: active ? col    : "transparent",
      color:      active ? "white" : col,
      border:     `1px solid ${col}`,
    };
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      <span className="text-xs font-bold uppercase tracking-widest mr-1"
        style={{ color: "var(--text-muted)", letterSpacing: "0.12em" }}>
        Période
      </span>

      {/* Boutons durée glissante */}
      {DAYS_OPTIONS.map((o) => {
        const active = value.year === null && value.days === o.days;
        return (
          <button key={o.days}
            onClick={() => onChange({ days: o.days, year: null })}
            style={activeStyle(active)}>
            {o.label}
          </button>
        );
      })}

      {/* Séparateur */}
      <div style={{ width: 1, height: 16, background: "var(--border)", margin: "0 4px" }} />

      {/* Boutons années */}
      {YEARS.map((y) => {
        const active = value.year === y;
        return (
          <button key={y}
            onClick={() => onChange({ days: 60, year: y })}
            style={activeYearStyle(active, y)}>
            {y}
          </button>
        );
      })}
    </div>
  );
}

// ── Helper pour construire les query params API ───────────────────────────────
export function periodToParams(p: Period): string {
  if (p.year) return `year=${p.year}`;
  return `days=${p.days}`;
}
