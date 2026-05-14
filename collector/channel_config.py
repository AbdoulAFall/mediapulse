# Ajouter une chaîne : copier un bloc, renseigner name + handle ou channel_id, active=True.
# Le channel_id est résolu automatiquement depuis le handle au premier lancement.

CHANNELS = [
    {
        "name": "TFM",
        "handle": "@tfmsn",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",  # heure UTC (= heure Dakar)
    },
    {
        "name": "RTS",
        "handle": "@rts-radiotelevisionsenegalaise",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",
        "title_hints": ["kenkelibaa"],  # mot-clé caractéristique de la matinale RTS
    },
    {
        "name": "2STV",
        "handle": "@2stvsenegal",
        "channel_id": "UCeLEGbj240J6JhpP7ba8GwA",  # confirmé
        "active": True,
        "matinale_start": "07:30",
    },
    {
        "name": "Sen TV",
        "handle": "@GroupeDMEDIACOM",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",
    },
    {
        "name": "Walf TV",
        "handle": "@WalfadjriTV",
        "channel_id": None,
        "active": True,
        "matinale_start": "07:00",
    },
    {
        "name": "Solo Media Group",
        "handle": "@SOLOMEDIAGROUP-f9g1c",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",
    },
    {
        "name": "Xalaat TV",
        "handle": "@Xalaattv",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",
    },
    {
        "name": "Solution TV",
        "handle": "@solutioninfotv",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",
    },
    {
        "name": "Sans Limites TV",
        "handle": "@SanslimitesTV",
        "channel_id": None,
        "active": True,
        "matinale_start": "08:00",
    },
    {
        "name": "Seneweb TV",
        "handle": "@SenewebTV",
        "channel_id": None,
        "active": True,
        "matinale_start": "09:00",
    },
]
