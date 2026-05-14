"""
Affichage des stats dans le terminal.
"""
from collections import defaultdict
from datetime import datetime

import storage


def print_stats(days: int = 60):
    rows = storage.get_matinales_for_stats(days)
    if not rows:
        print("Aucune matinale trouvée. Lance d'abord : python main.py sync")
        return

    # Agrégation par chaîne
    by_channel: dict[str, list] = defaultdict(list)
    for r in rows:
        by_channel[r["channel_name"]].append(r)

    print(f"\n{'='*70}")
    print(f"  MATINALES — {days} derniers jours")
    print(f"{'='*70}\n")

    for channel, matinales in sorted(by_channel.items()):
        total_views = sum(m["view_count"] or 0 for m in matinales)
        avg_views = total_views // len(matinales) if matinales else 0

        print(f"  {channel.upper()}")
        print(f"  {'─'*60}")
        print(f"  Matinales détectées : {len(matinales)}")
        print(f"  Vues totales        : {total_views:,}")
        print(f"  Vues moyennes/épis. : {avg_views:,}")
        print()
        print(f"  {'Date':<12} {'Titre':<40} {'Vues':>10}")
        print(f"  {'─'*12} {'─'*40} {'─'*10}")

        for m in matinales[:10]:  # top 10 les plus récentes
            pub = m["published_at"][:10] if m["published_at"] else "?"
            title = (m["title"] or "")[:39]
            views = f"{m['view_count']:,}" if m["view_count"] is not None else "—"
            print(f"  {pub:<12} {title:<40} {views:>10}")

        if len(matinales) > 10:
            print(f"  ... et {len(matinales) - 10} autre(s)")
        print()

    print(f"{'='*70}")
    print(f"  TOTAL : {len(rows)} matinales | {sum(r['view_count'] or 0 for r in rows):,} vues cumulées")
    print(f"{'='*70}\n")
