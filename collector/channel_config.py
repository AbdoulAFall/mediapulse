# ──────────────────────────────────────────────────────────────────────────────
# SEED INITIAL — ce fichier n'est lu qu'une seule fois par storage.init_db()
# pour peupler les colonnes matinale_start / matinale_end / title_hints
# dans la table channels si elles sont vides.
#
# ➜ Pour ajouter ou modifier une chaîne en production :
#      Admin → Chaînes (interface web)
#    La DB est la source de vérité unique depuis storage.py v2.
# ──────────────────────────────────────────────────────────────────────────────
# matinale_start / matinale_end : heure UTC+0 (= heure de Dakar, pas de décalage)
# title_hints : mots-clés du nom de l'émission pour aider le scorer

CHANNELS = [
    {
        "name": "TFM",
        "handle": "@tfmsn",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:00",
        "matinale_end":   "11:00",
        "title_hints": ["infos matin"],
    },
    {
        "name": "RTS",
        "handle": "@rts-radiotelevisionsenegalaise",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:30",
        "matinale_end":   "11:00",
        "title_hints": ["kenkelibaa", "kenkeliba"],
    },
    {
        "name": "2STV",
        "handle": "@2stvsenegal",
        "channel_id": "UCeLEGbj240J6JhpP7ba8GwA",  # confirmé
        "active": True,
        "matinale_start": "07:00",
        "matinale_end":   "10:30",
        "title_hints": ["matin bonheur"],
    },
    {
        "name": "Sen TV",
        "handle": "@GroupeDMEDIACOM",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:30",
        "matinale_end":   "11:00",
        "title_hints": ["bloc matinale", "bloc matin"],
    },
    {
        "name": "Walf TV",
        "handle": "@WalfadjriTV",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:00",
        "matinale_end":   "10:30",
        "title_hints": [
            "votre matinale",   # "Votre matinale le R'Eveil" — hint le plus fiable
            "r’eveil",     # apostrophe typographique ' (U+2019)
            "r'eveil",          # apostrophe droite
            "réveil",
            "reveil",
        ],
    },
    {
        "name": "Solo Media Group",
        "handle": "@SOLOMEDIAGROUP-f9g1c",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:30",
        "matinale_end":   "11:00",
        "title_hints": ["la matinale d'infos", "matinale d'infos", "matinale infos"],
    },
    {
        "name": "Xalaat TV",
        "handle": "@Xalaattv",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:00",
        "matinale_end":   "11:00",
        "title_hints": ["lu xew tay"],
    },
    {
        "name": "Solution TV",
        "handle": "@solutioninfotv",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:00",
        "matinale_end":   "11:00",
    },
    {
        "name": "Sans Limites TV",
        "handle": "@SanslimitesTV",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:30",
        "matinale_end":   "11:00",
        "title_hints": ["café actu", "cafe actu"],
    },
    {
        "name": "Seneweb TV",
        "handle": "@SenewebTV",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",
        "matinale_end":   "12:00",
        "title_hints": ["matinale.sn", "matinale sn"],
    },
    {
        "name": "Eric Favre TV",
        "handle": "@ericfavretv",
        "channel_id": "UCCuWTUI5DxAzhamgb_gA74w",  # confirmé
        "active": True,
        "matinale_start": "07:00",
        "matinale_end":   "11:00",
        "title_hints": [],  # pas de titre fixe — détection par fenêtre horaire uniquement
    },
]
