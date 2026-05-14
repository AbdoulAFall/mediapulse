"""
Sélectionne la meilleure matinale parmi plusieurs lives candidats sur une même journée.

Score sur 2 critères :
  - Proximité heure attendue  (60%)
  - Similarité titre historique (40%)
"""
import re
from datetime import datetime, timezone

TOLERANCE_MINUTES = 90  # fenêtre de confiance autour de l'heure attendue

# Mots vides à ignorer dans la comparaison de titres
STOPWORDS = {
    "le", "la", "les", "de", "du", "des", "un", "une", "en", "et", "à",
    "au", "aux", "sur", "par", "pour", "avec", "dans", "ce", "se", "sa",
    "son", "est", "sont", "a", "l", "d", "j", "n", "qu", "y", "on",
    "du", "je", "il", "elle", "nous", "vous", "ils", "elles",
}


def _parse_utc(dt_str: str) -> datetime:
    return datetime.fromisoformat(dt_str.replace("Z", "+00:00")).astimezone(timezone.utc)


def _time_score(start_str: str, expected_hhmm: str) -> float:
    """
    Score [0.0–1.0] basé sur la proximité entre l'heure de début
    du live et l'heure attendue. Vaut 1.0 si exactement à l'heure,
    0.0 si l'écart dépasse TOLERANCE_MINUTES.
    """
    try:
        start_dt = _parse_utc(start_str)
        h, m = map(int, expected_hhmm.split(":"))
        expected_minutes = h * 60 + m
        actual_minutes = start_dt.hour * 60 + start_dt.minute
        diff = abs(actual_minutes - expected_minutes)
        return max(0.0, 1.0 - diff / TOLERANCE_MINUTES)
    except Exception:
        return 0.0


def _tokenize(title: str) -> set[str]:
    words = re.findall(r"[a-zàâäéèêëîïôùûüç]+", title.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 2}


def _title_score(title: str, historical_titles: list[str]) -> float:
    """
    Score [0.0–1.0] basé sur les mots communs avec les titres historiques.
    On construit un vocabulaire pondéré par fréquence sur les N derniers titres.
    """
    if not historical_titles:
        return 0.5  # pas d'historique → score neutre

    # Fréquence des mots dans l'historique
    freq: dict[str, int] = {}
    for ht in historical_titles:
        for word in _tokenize(ht):
            freq[word] = freq.get(word, 0) + 1

    if not freq:
        return 0.5

    # Mots significatifs : présents dans au moins 30% des titres historiques
    threshold = max(1, len(historical_titles) * 0.3)
    signature = {w for w, c in freq.items() if c >= threshold}

    if not signature:
        return 0.5

    candidate_words = _tokenize(title)
    overlap = len(candidate_words & signature)
    return min(1.0, overlap / len(signature))


def pick_best(
    candidates: list[dict],
    expected_start: str,
    historical_titles: list[str],
) -> dict:
    """
    Parmi une liste de lives candidats pour une même journée/chaîne,
    retourne celui avec le meilleur score.

    Chaque candidat doit avoir : youtube_video_id, title, published_at, duration_seconds.
    """
    if len(candidates) == 1:
        return candidates[0]

    scored = []
    for c in candidates:
        ts = _time_score(c["published_at"], expected_start)
        tits = _title_score(c["title"], historical_titles)
        total = 0.6 * ts + 0.4 * tits
        scored.append((total, c))
        print(
            f"     [{c['title'][:50]}] "
            f"heure={ts:.2f} titre={tits:.2f} total={total:.2f}"
        )

    scored.sort(key=lambda x: x[0], reverse=True)
    winner = scored[0][1]
    print(f"     → Sélectionné : {winner['title'][:60]}")
    return winner
