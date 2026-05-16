"""
MediaPulse — Collecteur de matinales TV sénégalaises

Commandes :
  python main.py sync                    — Sync 60 derniers jours (toutes les chaînes)
  python main.py sync 730                — Sync 2 ans en arrière
  python main.py sync 730 "Walf TV"     — Sync 2 ans sur une seule chaîne
  python main.py detect                  — Détecte uniquement les nouvelles matinales (60j)
  python main.py detect 730 "TFM"        — Détecte sur 2 ans pour TFM uniquement
  python main.py refresh                 — Met à jour les vues uniquement (seuil 6h)
  python main.py refresh_today           — Snapshot vues des matinales d'aujourd'hui (seuil 15 min)
  python main.py stats                   — Rapport des 60 derniers jours
  python main.py stats 730               — Rapport sur 2 ans
"""
import sys
import os
from pathlib import Path

# Charge le .env si présent
env_file = Path(__file__).parent.parent / ".env"
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip())

import storage
import detector
import report

DEFAULT_DAYS = 60


def _parse_days(args: list[str], position: int = 1) -> int:
    if len(args) > position:
        try:
            days = int(args[position])
            if days < 1 or days > 730:
                print(f"⚠  Période invalide : {days}. Valeur acceptée : 1–730 jours.")
                sys.exit(1)
            return days
        except ValueError:
            # Ce n'est pas un nombre → c'est peut-être le filtre chaîne, on ignore
            pass
    return DEFAULT_DAYS


def _parse_channel_filter(args: list[str]) -> str | None:
    """Retourne le nom de la chaîne si passé en 3e argument (après commande + jours)."""
    if len(args) > 2:
        return args[2].strip()
    return None


def _filter_channels(channels: list[dict], name_filter: str | None) -> list[dict]:
    if not name_filter:
        return channels
    matched = [c for c in channels if name_filter.lower() in c["name"].lower()]
    if not matched:
        print(f"⚠  Aucune chaîne active ne correspond à '{name_filter}'.")
        print(f"   Chaînes disponibles : {', '.join(c['name'] for c in channels)}")
        sys.exit(1)
    print(f"   → Filtre actif : {', '.join(c['name'] for c in matched)}")
    return matched


def cmd_sync(days: int = DEFAULT_DAYS, channel_filter: str | None = None):
    print(f"\n[1/4] Initialisation base de données...")
    storage.init_db()

    print(f"[2/4] Résolution des chaînes YouTube...")
    channels = detector.sync_channels()
    channels = _filter_channels(channels, channel_filter)

    if not channels:
        print("Aucune chaîne active configurée.")
        return

    print(f"\n[3/4] Détection des matinales ({days} derniers jours)...")
    if days > 60:
        print(f"      ⏳ Historique long — cette opération peut prendre 20–30 min.")
    new = detector.detect_matinales(channels, days=days)

    print(f"\n[4/4] Refresh des compteurs de vues ({days}j)...")
    detector.refresh_view_counts(days=days)

    print(f"\n✓ Sync terminé — {new} nouvelle(s) matinale(s) détectée(s).\n")


def cmd_detect(days: int = DEFAULT_DAYS, channel_filter: str | None = None):
    storage.init_db()
    print(f"\n[1/2] Résolution des chaînes...")
    channels = detector.sync_channels()
    channels = _filter_channels(channels, channel_filter)
    print(f"\n[2/2] Détection des matinales ({days}j)...")
    new = detector.detect_matinales(channels, days=days)
    print(f"\n✓ {new} nouvelle(s) matinale(s) détectée(s).\n")


def cmd_refresh(days: int = DEFAULT_DAYS, channel_filter: str | None = None):
    storage.init_db()
    print(f"\nRefresh des compteurs de vues ({days}j)...")
    detector.refresh_view_counts(days=days)
    print()


def cmd_refresh_today(_days: int = DEFAULT_DAYS, channel_filter: str | None = None):
    """Snapshot toutes les 15 min pour les matinales d'aujourd'hui."""
    storage.init_db()
    print("\nRefresh vues J0 (seuil 15 min)...")
    detector.refresh_today_views()
    print()


def cmd_stats(days: int = DEFAULT_DAYS, channel_filter: str | None = None):
    storage.init_db()
    report.print_stats(days)


COMMANDS = {
    "sync": cmd_sync,
    "detect": cmd_detect,
    "refresh": cmd_refresh,
    "refresh_today": cmd_refresh_today,
    "stats": cmd_stats,
}


def main():
    args = sys.argv[1:]
    if not args or args[0] not in COMMANDS:
        print(__doc__)
        sys.exit(1)

    cmd            = args[0]
    days           = _parse_days(args)
    channel_filter = _parse_channel_filter(args)
    COMMANDS[cmd](days, channel_filter)


if __name__ == "__main__":
    missing = [v for v in ("YOUTUBE_API_KEY", "DATABASE_URL") if not os.environ.get(v)]
    if missing:
        for v in missing:
            print(f"\n⚠  Variable {v} manquante.")
        print("   Copie .env.example → .env et renseigne les valeurs.\n")
        sys.exit(1)
    main()
