"""
MediaPulse — Collecteur de matinales TV sénégalaises

Commandes :
  python main.py sync    — Synchronise les chaînes + détecte les matinales + refresh vues
  python main.py detect  — Détecte uniquement les nouvelles matinales
  python main.py refresh — Met à jour les vues uniquement
  python main.py stats   — Affiche le rapport des 60 derniers jours
  python main.py stats 30 — Rapport sur les 30 derniers jours
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


def cmd_sync():
    print("\n[1/3] Initialisation base de données...")
    storage.init_db()

    print("[2/3] Résolution des chaînes YouTube...")
    channels = detector.sync_channels()

    if not channels:
        print("Aucune chaîne active configurée.")
        return

    print(f"\n[3/4] Détection des matinales (60 derniers jours)...")
    new = detector.detect_matinales(channels)

    print(f"\n[4/4] Refresh des compteurs de vues...")
    detector.refresh_view_counts()

    print(f"\n✓ Sync terminé — {new} nouvelle(s) matinale(s) détectée(s).\n")


def cmd_detect():
    storage.init_db()
    print("\n[1/2] Résolution des chaînes...")
    channels = detector.sync_channels()
    print("\n[2/2] Détection des matinales...")
    new = detector.detect_matinales(channels)
    print(f"\n✓ {new} nouvelle(s) matinale(s) détectée(s).\n")


def cmd_refresh():
    storage.init_db()
    print("\nRefresh des compteurs de vues...")
    detector.refresh_view_counts()
    print()


def cmd_stats(days: int = 60):
    storage.init_db()
    report.print_stats(days)


COMMANDS = {
    "sync": cmd_sync,
    "detect": cmd_detect,
    "refresh": cmd_refresh,
    "stats": cmd_stats,
}


def main():
    args = sys.argv[1:]
    if not args or args[0] not in COMMANDS:
        print(__doc__)
        sys.exit(1)

    cmd = args[0]
    if cmd == "stats" and len(args) > 1:
        try:
            COMMANDS[cmd](int(args[1]))
        except ValueError:
            print("Usage : python main.py stats [JOURS]")
            sys.exit(1)
    else:
        COMMANDS[cmd]()


if __name__ == "__main__":
    if not os.environ.get("YOUTUBE_API_KEY"):
        print("\n⚠  Variable YOUTUBE_API_KEY manquante.")
        print("   Copie .env.example → .env et renseigne ta clé.\n")
        sys.exit(1)
    main()
