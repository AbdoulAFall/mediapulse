"""
Jours fériés sénégalais — fixes et islamiques (2024–2027).

Jours fériés officiels fixes :
  1er janvier   — Jour de l'An
  4 avril       — Fête de l'Indépendance
  1er mai       — Fête du Travail
  15 août       — Assomption
  1er novembre  — Toussaint
  25 décembre   — Noël

Jours fériés islamiques (dates lunaires, variables chaque année) :
  Korité        — Aïd el-Fitr (fin du Ramadan)
  Tabaski       — Aïd el-Adha
  Tamkharit     — Achoura
  Gamou         — Mawlid (Maouloud)

Sources : Journal Officiel de la République du Sénégal
"""

from datetime import date

# ── Jours fériés fixes (mois, jour) ──────────────────────────
FIXED = {
    (1,  1),   # Jour de l'An
    (4,  4),   # Fête de l'Indépendance
    (5,  1),   # Fête du Travail
    (8, 15),   # Assomption
    (11, 1),   # Toussaint
    (12, 25),  # Noël
}

# ── Jours fériés islamiques (dates exactes par année) ────────
# Mise à jour annuelle nécessaire — ajouter l'année suivante chaque fin d'année
ISLAMIC: set[date] = {
    # Korité (Aïd el-Fitr)
    date(2024, 4, 10),
    date(2025, 3, 30),
    date(2026, 3, 20),
    date(2027, 3,  9),

    # Tabaski (Aïd el-Adha)
    date(2024, 6, 17),
    date(2025, 6,  7),
    date(2026, 5, 27),
    date(2027, 5, 17),

    # Tamkharit (Achoura)
    date(2024, 7, 16),
    date(2025, 7,  5),
    date(2026, 6, 24),
    date(2027, 6, 14),

    # Gamou (Mawlid / Maouloud)
    date(2024, 9, 15),
    date(2025, 9,  4),
    date(2026, 8, 25),
    date(2027, 8, 14),
}


def is_holiday(day_str: str) -> bool:
    """
    Retourne True si la date (format YYYY-MM-DD) est un jour férié sénégalais.
    """
    try:
        d = date.fromisoformat(day_str)
    except ValueError:
        return False

    # Fixe
    if (d.month, d.day) in FIXED:
        return True

    # Islamique
    if d in ISLAMIC:
        return True

    return False
