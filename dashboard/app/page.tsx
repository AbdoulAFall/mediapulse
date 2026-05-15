"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchStats, fetchSchedule } from "@/lib/api";

/* ── Données publiques (7 derniers jours) ── */
function useLiveStats() {
  const [data, setData]     = useState<{ matinales: number; channels: number; topChannel: string } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    Promise.all([fetchStats(7), fetchSchedule(7)])
      .then(([stats]) => {
        setData({
          matinales:  stats.total_matinales,
          channels:   stats.channels.filter(c => c.matinales_count > 0).length,
          topChannel: stats.channels[0]?.name ?? "—",
        });
      })
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);
  return { data, loading };
}

/* ── Compteur animé ── */
function Counter({ to, suffix = "" }: { to: number; suffix?: string }) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!to) return;
    let start = 0;
    const step = Math.ceil(to / 40);
    const id = setInterval(() => {
      start += step;
      if (start >= to) { setVal(to); clearInterval(id); }
      else setVal(start);
    }, 30);
    return () => clearInterval(id);
  }, [to]);
  return <>{val}{suffix}</>;
}

const FEATURES = [
  {
    icon: "📡",
    title: "Détection automatique",
    desc: "Chaque matinale est détectée dès sa mise en ligne sur YouTube. Lundi au vendredi, 6h–12h, toutes les 30 minutes.",
  },
  {
    icon: "📊",
    title: "Statistiques comparatives",
    desc: "Vues, likes, durée, heure de début — comparez toutes les chaînes sur la même période en un coup d'œil.",
  },
  {
    icon: "🕐",
    title: "Grille des horaires",
    desc: "Visualisez les créneaux moyens de diffusion par chaîne et mesurez leur régularité à la minute près.",
  },
  {
    icon: "▶",
    title: "Lien direct vers l'émission",
    desc: "Chaque matinale est cliquable. Accédez directement à la vidéo YouTube correspondante.",
  },
];

const PLANS = [
  {
    name: "Starter",
    price: "199 €",
    period: "/ mois",
    desc: "Pour une équipe éditoriale qui suit le marché.",
    features: ["3 chaînes au choix", "60 jours d'historique", "Dashboard complet", "Sync toutes les 30 min"],
    cta: "Demander un accès",
    highlight: false,
  },
  {
    name: "Pro",
    price: "399 €",
    period: "/ mois",
    desc: "Pour les agences et directions de communication.",
    features: ["10 chaînes", "2 ans d'historique", "Export CSV", "Accès API", "Support prioritaire"],
    cta: "Demander un accès",
    highlight: true,
  },
  {
    name: "Enterprise",
    price: "Sur devis",
    period: "",
    desc: "Intégration sur-mesure pour groupes médias.",
    features: ["Chaînes illimitées", "Transcriptions IA", "Extraction d'entités", "Alertes temps réel", "SLA garanti"],
    cta: "Nous contacter",
    highlight: false,
  },
];

export default function Landing() {
  const { data, loading } = useLiveStats();
  const [email, setEmail] = useState("");
  const [sent, setSent]   = useState(false);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSent(true);
  }

  return (
    <div style={{ background: "var(--bg)", color: "var(--text)" }}>

      {/* ── Bandeau rouge ── */}
      <div style={{ background: "var(--accent)", height: 4 }} />

      {/* ── Nav ── */}
      <nav style={{ background: "var(--surface)", borderBottom: "2px solid var(--ink)" }}>
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-display font-black" style={{ fontSize: 22, color: "var(--ink)" }}>
            MEDIAPULSE
          </span>
          <div className="flex items-center gap-4">
            <a href="#tarifs" className="text-xs font-bold uppercase tracking-wider hidden md:block"
              style={{ color: "var(--text-muted)" }}>
              Tarifs
            </a>
            <Link href="/dashboard"
              className="text-xs font-bold uppercase tracking-widest px-4 py-2 transition-opacity hover:opacity-80"
              style={{ background: "var(--ink)", color: "white", letterSpacing: "0.1em" }}>
              Accéder →
            </Link>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="max-w-6xl mx-auto px-6 py-20 md:py-28">
        <div className="max-w-3xl">
          <p className="text-xs font-bold uppercase tracking-widest mb-4"
            style={{ color: "var(--accent)", letterSpacing: "0.25em" }}>
            Intelligence Media · Sénégal
          </p>
          <h1 className="font-display font-black leading-none mb-6"
            style={{ fontSize: "clamp(40px, 7vw, 80px)", color: "var(--ink)" }}>
            Suivez chaque<br />
            <span style={{ color: "var(--accent)" }}>matinale TV</span><br />
            en temps réel.
          </h1>
          <p className="text-lg mb-10 max-w-xl" style={{ color: "var(--text-muted)", lineHeight: 1.7 }}>
            MediaPulse monitore automatiquement les émissions matinales
            des principales chaînes sénégalaises — vues, durées, horaires —
            et vous livre les données chaque matin avant 9h.
          </p>

          {/* CTA */}
          <div className="flex flex-wrap gap-3">
            <a href="#acces"
              className="px-6 py-3 text-sm font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
              style={{ background: "var(--accent)", color: "white", letterSpacing: "0.1em" }}>
              Demander un accès gratuit
            </a>
            <Link href="/dashboard"
              className="px-6 py-3 text-sm font-bold uppercase tracking-wider border-2 transition-opacity hover:opacity-70"
              style={{ borderColor: "var(--ink)", color: "var(--ink)", letterSpacing: "0.1em" }}>
              Voir la démo →
            </Link>
          </div>
        </div>
      </section>

      {/* ── Stats live ── */}
      <section style={{ background: "var(--ink)", color: "white" }}>
        <div className="max-w-6xl mx-auto px-6 py-10">
          <p className="text-xs font-bold uppercase tracking-widest mb-6 text-center"
            style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.2em" }}>
            Cette semaine · Données en direct
          </p>
          <div className="grid grid-cols-3 gap-0 text-center"
            style={{ borderTop: "1px solid rgba(255,255,255,0.1)" }}>
            {[
              { label: "Matinales détectées", value: data?.matinales ?? 0, suffix: "" },
              { label: "Chaînes monitorées",  value: data?.channels ?? 0,  suffix: "" },
              { label: "Jours analysés",      value: 7,                    suffix: "j" },
            ].map((s, i) => (
              <div key={s.label} className="py-8 px-4"
                style={{ borderRight: i < 2 ? "1px solid rgba(255,255,255,0.1)" : "none" }}>
                <p className="font-display font-black mb-1"
                  style={{ fontSize: 48, color: i === 0 ? "#ff4444" : "white" }}>
                  {loading ? "—" : <Counter to={s.value} suffix={s.suffix} />}
                </p>
                <p className="text-xs uppercase tracking-wider"
                  style={{ color: "rgba(255,255,255,0.4)", letterSpacing: "0.15em" }}>
                  {s.label}
                </p>
              </div>
            ))}
          </div>
          {data?.topChannel && (
            <p className="text-center text-xs mt-4" style={{ color: "rgba(255,255,255,0.3)" }}>
              Chaîne dominante cette semaine :{" "}
              <strong style={{ color: "#ff4444" }}>{data.topChannel}</strong>
            </p>
          )}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}>
            Fonctionnalités
          </p>
          <h2 className="font-display font-black" style={{ fontSize: 36, color: "var(--ink)" }}>
            Tout ce dont vous avez besoin.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px"
          style={{ background: "var(--border)", border: "1px solid var(--border)" }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="p-8" style={{ background: "var(--surface)" }}>
              <span className="text-3xl mb-4 block">{f.icon}</span>
              <h3 className="font-display font-bold text-xl mb-3" style={{ color: "var(--ink)" }}>
                {f.title}
              </h3>
              <p className="text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {f.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Aperçu dashboard (teaser) ── */}
      <section style={{ background: "var(--surface2)", borderTop: "1px solid var(--border)", borderBottom: "1px solid var(--border)" }}
        className="py-20">
        <div className="max-w-6xl mx-auto px-6">
          <div className="mb-10 text-center">
            <p className="text-xs font-bold uppercase tracking-widest mb-2"
              style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}>
              Aperçu
            </p>
            <h2 className="font-display font-black" style={{ fontSize: 36, color: "var(--ink)" }}>
              Un dashboard conçu pour l&apos;efficacité.
            </h2>
          </div>
          {/* Preview verrouillée */}
          <div className="relative" style={{ maxWidth: 900, margin: "0 auto" }}>
            <div style={{
              border: "2px solid var(--ink)",
              background: "var(--surface)",
              padding: 24,
              filter: "blur(3px)",
              pointerEvents: "none",
              userSelect: "none",
            }}>
              {/* Faux KPIs */}
              <div className="grid grid-cols-4 gap-0 mb-6" style={{ border: "1px solid var(--border)" }}>
                {["55 matinales", "2,4M vues", "43k / ép.", "TFM"].map((v, i) => (
                  <div key={v} className="p-4" style={{ background: i === 1 ? "var(--ink)" : "var(--surface)", borderRight: i < 3 ? "1px solid var(--border)" : "none" }}>
                    <div className="font-display font-black text-2xl" style={{ color: i === 1 ? "white" : "var(--ink)" }}>{v}</div>
                    <div className="text-xs mt-1" style={{ color: "rgba(128,128,128,0.6)" }}>████████</div>
                  </div>
                ))}
              </div>
              {/* Faux graphe */}
              <div style={{ height: 120, background: "var(--surface2)", border: "1px solid var(--border)", display: "flex", alignItems: "flex-end", gap: 8, padding: "12px 16px" }}>
                {[60, 80, 45, 90, 70, 100, 55, 85, 65, 95].map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, background: i % 3 === 0 ? "var(--accent)" : "var(--border)" }} />
                ))}
              </div>
            </div>
            {/* Overlay verrouillage */}
            <div className="absolute inset-0 flex flex-col items-center justify-center"
              style={{ background: "rgba(245, 242, 235, 0.7)" }}>
              <div className="text-center p-8" style={{ background: "var(--ink)" }}>
                <p className="text-2xl mb-2">🔒</p>
                <p className="font-display font-bold text-white text-xl mb-1">Accès restreint</p>
                <p className="text-xs mb-4" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Demandez un accès pour voir les vraies données
                </p>
                <a href="#acces"
                  className="inline-block px-5 py-2 text-xs font-bold uppercase tracking-wider"
                  style={{ background: "var(--accent)", color: "white" }}>
                  Demander un accès →
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Tarifs ── */}
      <section id="tarifs" className="max-w-6xl mx-auto px-6 py-20">
        <div className="mb-12">
          <p className="text-xs font-bold uppercase tracking-widest mb-2"
            style={{ color: "var(--text-muted)", letterSpacing: "0.2em" }}>
            Tarifs
          </p>
          <h2 className="font-display font-black" style={{ fontSize: 36, color: "var(--ink)" }}>
            Simple et transparent.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-px"
          style={{ background: "var(--border)", border: "1px solid var(--border)" }}>
          {PLANS.map((plan) => (
            <div key={plan.name} className="p-8 flex flex-col"
              style={{ background: plan.highlight ? "var(--ink)" : "var(--surface)" }}>
              {plan.highlight && (
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 mb-4 self-start"
                  style={{ background: "var(--accent)", color: "white" }}>
                  Le plus populaire
                </span>
              )}
              <p className="text-xs font-bold uppercase tracking-widest mb-2"
                style={{ color: plan.highlight ? "rgba(255,255,255,0.4)" : "var(--text-muted)", letterSpacing: "0.15em" }}>
                {plan.name}
              </p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="font-display font-black" style={{ fontSize: 40, color: plan.highlight ? "white" : "var(--ink)" }}>
                  {plan.price}
                </span>
                <span className="text-sm" style={{ color: plan.highlight ? "rgba(255,255,255,0.4)" : "var(--text-muted)" }}>
                  {plan.period}
                </span>
              </div>
              <p className="text-sm mb-6" style={{ color: plan.highlight ? "rgba(255,255,255,0.5)" : "var(--text-muted)" }}>
                {plan.desc}
              </p>
              <ul className="space-y-2 mb-8 flex-1">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm"
                    style={{ color: plan.highlight ? "rgba(255,255,255,0.8)" : "var(--text)" }}>
                    <span style={{ color: plan.highlight ? "#ff4444" : "var(--accent)", fontWeight: 700 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>
              <a href="#acces"
                className="text-center py-3 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                style={{
                  background:    plan.highlight ? "var(--accent)" : "transparent",
                  color:         plan.highlight ? "white" : "var(--ink)",
                  border:        plan.highlight ? "none" : "2px solid var(--ink)",
                  letterSpacing: "0.1em",
                }}>
                {plan.cta}
              </a>
            </div>
          ))}
        </div>
      </section>

      {/* ── Formulaire accès ── */}
      <section id="acces"
        style={{ background: "var(--ink)", color: "white" }}
        className="py-20">
        <div className="max-w-lg mx-auto px-6 text-center">
          <p className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: "rgba(255,255,255,0.3)", letterSpacing: "0.2em" }}>
            Accès anticipé
          </p>
          <h2 className="font-display font-black mb-4" style={{ fontSize: 36 }}>
            Rejoignez la beta.
          </h2>
          <p className="text-sm mb-8" style={{ color: "rgba(255,255,255,0.5)", lineHeight: 1.7 }}>
            Laissez votre email — nous vous recontactons sous 24h
            pour un accès démo personnalisé.
          </p>
          {sent ? (
            <div className="p-6" style={{ border: "1px solid rgba(255,255,255,0.2)" }}>
              <p className="font-display font-bold text-xl mb-1" style={{ color: "#ff4444" }}>
                Message reçu !
              </p>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.5)" }}>
                Nous vous recontactons sous 24h.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex gap-0">
              <input
                type="email" required
                placeholder="votre@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="flex-1 px-4 py-3 text-sm outline-none"
                style={{ background: "rgba(255,255,255,0.08)", color: "white",
                         border: "1px solid rgba(255,255,255,0.2)", borderRight: "none" }}
              />
              <button type="submit"
                className="px-6 py-3 text-xs font-bold uppercase tracking-wider transition-opacity hover:opacity-80"
                style={{ background: "var(--accent)", color: "white", whiteSpace: "nowrap", letterSpacing: "0.1em" }}>
                Demander →
              </button>
            </form>
          )}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{ background: "var(--surface)", borderTop: "2px solid var(--ink)" }}>
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <span className="font-display font-black text-sm" style={{ color: "var(--ink)" }}>
            MEDIAPULSE
          </span>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            Données YouTube · Lun–Ven · UTC
          </p>
          <Link href="/dashboard" className="text-xs font-bold uppercase tracking-wider hover:opacity-70"
            style={{ color: "var(--accent)" }}>
            Dashboard →
          </Link>
        </div>
      </footer>

    </div>
  );
}
