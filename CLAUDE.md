# MediaPulse Sénégal — Contexte projet pour Claude Code

## Vue d'ensemble

**MediaPulse** est une plateforme SaaS B2B de media intelligence TV ciblant le marché sénégalais.

L'objectif : monitorer automatiquement les matinales d'information des principales chaînes TV sénégalaises diffusées sur YouTube, et produire des statistiques comparatives inter-chaînes (temps de parole par sujet, fréquence de mention d'entités, sentiment éditorial, share of voice).

**Fondateur basé en France** → pas d'infrastructure physique au Sénégal. Tout tourne en cloud depuis la France.

---

## Chaînes cibles (MVP)

| Chaîne | Groupe | URL YouTube |
|--------|--------|-------------|
| TFM | Futurs Médias | https://www.youtube.com/@TFMofficiel |
| RTS | Public | https://www.youtube.com/@rts-radiotelevisionsenegalaise |
| 2STV | Origines SA | https://www.youtube.com/channel/UCeLEGbj240J6JhpP7ba8GwA |
| Sen TV | D-Média | À confirmer |
| Walf TV | Groupe Walf | À confirmer |

Plage horaire cible : **6h00–10h00 (heure de Dakar, UTC+0)** — matinales d'information.

---

## Architecture technique retenue

### Stack complète

```
YouTube Data API v3      →  Détection nouvelles vidéos (playlistItems.list, 1 unité/appel)
yt-dlp                   →  Extraction audio MP3 16kHz
Cloudflare R2            →  Stockage temporaire audio (rétention 7 jours)
OpenAI Whisper API       →  Transcription ASR (whisper-1, $0.006/min)
spaCy fr_core_news_lg    →  Extraction entités nommées (NER)
Dictionnaire keywords    →  Classification thématique (MVP — pas de ML)
PostgreSQL (Supabase)    →  Base de données principale
Upstash Redis            →  Cache KPIs dashboard (optionnel MVP)
FastAPI                  →  Backend API REST
APScheduler              →  Planification des jobs (polling toutes les 30 min)
Next.js + Recharts       →  Dashboard frontend
Vercel                   →  Hébergement frontend
Railway                  →  Hébergement backend
Resend                   →  Envoi emails alertes
```

### Flux de données (pipeline complet)

```
1. DÉTECTION  — APScheduler déclenche toutes les 30 min
               → YouTube Data API v3 (playlistItems.list) sur chaque chaîne
               → Compare avec videos déjà traitées en base
               → Si nouvelle vidéo détectée → enqueue job

2. COLLECTE   — yt-dlp télécharge l'audio en MP3 16kHz
               → Upload vers Cloudflare R2
               → Métadonnées YouTube sauvegardées (titre, durée, vues, heure publication)

3. TRANSCRIPTION — Whisper API (whisper-1)
               → Paramètre prompt : injecter noms personnalités sénégalaises connues
                 pour améliorer précision sur noms propres locaux (sans fine-tuning)
               → Sortie : texte + timestamps par phrase (format JSON)
               → Score de confiance stocké en base

4. ANALYSE NLP — spaCy fr_core_news_lg
               → Extraction entités : personnes, organisations, lieux
               → Classification thèmes : dictionnaire keywords par secteur
                 (Politique, Économie, Sport, Religion, Société, International)
               → Analyse sentiment : pipeline HuggingFace FR

5. KPIs       → Calcul agrégations :
                 - Temps de parole par sujet (%)
                 - Nombre de mentions par entité
                 - Share of voice inter-chaînes
                 - Score sentiment moyen par chaîne
                 - Indicateur ponctualité (heure théorique vs publication YouTube)
                 - Digital reach : vues YouTube à H+1, likes, commentaires

6. STOCKAGE   → PostgreSQL (Supabase) pour données structurées
               → R2 pour fichiers (audio supprimé après 7j, transcriptions JSON conservées)

7. SERVE      → FastAPI expose les KPIs via REST
               → Dashboard Next.js affiche comparatifs inter-chaînes
               → Liens YouTube avec ?t=XXX pour sauter au bon timestamp (killer feature)
```

---

## Schéma base de données (PostgreSQL)

```sql
-- Chaînes TV monitorées
CREATE TABLE channels (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,           -- ex: "TFM"
  youtube_id  TEXT UNIQUE NOT NULL,    -- ex: "UC5NQ49FVRIAuWE1el6L2gkg"
  playlist_id TEXT NOT NULL,           -- playlist "Uploads" de la chaîne
  active      BOOLEAN DEFAULT true,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- Vidéos YouTube détectées
CREATE TABLE videos (
  id                  SERIAL PRIMARY KEY,
  channel_id          INTEGER REFERENCES channels(id),
  youtube_video_id    TEXT UNIQUE NOT NULL,
  title               TEXT,
  duration_seconds    INTEGER,
  published_at        TIMESTAMPTZ,     -- heure publication YouTube
  scheduled_start_at  TIMESTAMPTZ,     -- heure théorique début matinale
  view_count_h1       INTEGER,         -- vues à H+1 après publication
  like_count          INTEGER,
  comment_count       INTEGER,
  r2_audio_key        TEXT,            -- clé R2 du fichier audio (null après suppression)
  processed           BOOLEAN DEFAULT false,
  created_at          TIMESTAMPTZ DEFAULT now()
);

-- Transcriptions
CREATE TABLE transcriptions (
  id              SERIAL PRIMARY KEY,
  video_id        INTEGER REFERENCES videos(id),
  full_text       TEXT,
  segments        JSONB,               -- [{start, end, text, confidence}]
  whisper_model   TEXT DEFAULT 'whisper-1',
  avg_confidence  FLOAT,               -- score moyen de confiance ASR
  language        TEXT DEFAULT 'fr',
  r2_json_key     TEXT,                -- clé R2 du JSON complet
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Entités extraites
CREATE TABLE entities (
  id              SERIAL PRIMARY KEY,
  video_id        INTEGER REFERENCES videos(id),
  entity_text     TEXT NOT NULL,       -- ex: "Macky Sall"
  entity_type     TEXT NOT NULL,       -- PERSON | ORG | LOC | MISC
  mention_count   INTEGER DEFAULT 1,
  sentiment_score FLOAT,               -- -1.0 à +1.0
  first_mention_s INTEGER,             -- timestamp première mention (secondes)
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- KPIs journaliers agrégés (pour dashboard rapide)
CREATE TABLE analytics_daily (
  id              SERIAL PRIMARY KEY,
  channel_id      INTEGER REFERENCES channels(id),
  date            DATE NOT NULL,
  topic           TEXT NOT NULL,       -- ex: "Politique"
  duration_s      INTEGER,             -- temps de parole en secondes
  mention_count   INTEGER,
  sentiment_avg   FLOAT,
  UNIQUE(channel_id, date, topic)
);

-- Alertes configurées par client
CREATE TABLE alerts (
  id              SERIAL PRIMARY KEY,
  tenant_id       INTEGER NOT NULL,    -- isolation multi-client
  keywords        TEXT[],              -- mots-clés à surveiller
  channel_ids     INTEGER[],           -- chaînes à surveiller (null = toutes)
  notify_email    TEXT,
  notify_webhook  TEXT,
  active          BOOLEAN DEFAULT true,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Index utiles
CREATE INDEX idx_videos_channel_date ON videos(channel_id, published_at);
CREATE INDEX idx_entities_video ON entities(video_id);
CREATE INDEX idx_entities_text ON entities(entity_text);
CREATE INDEX idx_analytics_channel_date ON analytics_daily(channel_id, date);
```

---

## Structure du projet

```
mediapulse/
├── CLAUDE.md                    ← ce fichier
├── .env.example                 ← variables d'environnement requises
│
├── collector/                   ← service de collecte (Python)
│   ├── main.py                  ← point d'entrée APScheduler
│   ├── youtube_detector.py      ← YouTube Data API v3 (playlistItems.list)
│   ├── audio_extractor.py       ← yt-dlp wrapper
│   ├── r2_uploader.py           ← Cloudflare R2 (boto3 S3-compatible)
│   └── requirements.txt
│
├── pipeline/                    ← service de traitement IA (Python)
│   ├── transcriber.py           ← Whisper API + prompt injection
│   ├── nlp_analyzer.py          ← spaCy NER + keywords classifier
│   ├── sentiment.py             ← HuggingFace sentiment FR
│   ├── kpi_calculator.py        ← agrégations et métriques
│   └── requirements.txt
│
├── api/                         ← backend FastAPI (Python)
│   ├── main.py
│   ├── routers/
│   │   ├── stats.py             ← GET /stats
│   │   ├── mentions.py          ← GET /mentions
│   │   ├── transcripts.py       ← GET /transcript/:video_id
│   │   └── alerts.py            ← POST /alert, GET /alerts
│   ├── models.py                ← Pydantic schemas
│   ├── database.py              ← SQLAlchemy + Supabase
│   └── requirements.txt
│
├── dashboard/                   ← frontend Next.js
│   ├── app/
│   │   ├── page.tsx             ← dashboard comparatif inter-chaînes
│   │   ├── mentions/page.tsx    ← recherche de mentions
│   │   └── alerts/page.tsx      ← configuration alertes
│   ├── components/
│   │   ├── ChainComparison.tsx  ← graphique comparatif
│   │   ├── YoutubePlayer.tsx    ← lecteur synchronisé avec transcription
│   │   └── MentionCard.tsx      ← carte mention avec lien ?t=XXX
│   └── package.json
│
└── infra/
    ├── docker-compose.yml       ← dev local
    └── deploy.sh                ← déploiement Railway + Vercel
```

---

## Variables d'environnement requises

```bash
# YouTube
YOUTUBE_API_KEY=                 # Google Cloud Console → YouTube Data API v3

# OpenAI
OPENAI_API_KEY=                  # Pour Whisper API

# Cloudflare R2
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=mediapulse-audio
R2_ENDPOINT=https://<account>.r2.cloudflarestorage.com

# Supabase
DATABASE_URL=postgresql://...    # Supabase connection string
SUPABASE_URL=
SUPABASE_ANON_KEY=

# Redis (Upstash)
REDIS_URL=                       # Upstash Redis URL (optionnel MVP)

# Resend (emails)
RESEND_API_KEY=

# App
SECRET_KEY=                      # JWT signing key
ENVIRONMENT=development          # development | production
```

---

## Décisions techniques clés & justifications

| Décision | Choix | Pourquoi |
|----------|-------|----------|
| Source des flux | YouTube (pas satellite) | Opérable depuis la France, zéro matériel |
| Détection vidéos | `playlistItems.list` | 1 unité/appel vs 100 pour `search.list` |
| Extraction audio | `yt-dlp` | Open-source, robuste, MP3 16kHz direct |
| Transcription | Whisper API `whisper-1` | Pas de GPU à gérer, $0.006/min |
| Prompt Whisper | Noms propres sénégalais injectés | +10–15% précision NER sans fine-tuning |
| NLP thèmes MVP | Dictionnaire keywords | Déployable en 1 jour, suffisant V1 |
| BDD | PostgreSQL via Supabase | Managé, gratuit jusqu'à 500MB |
| Stockage fichiers | Cloudflare R2 | Zéro frais egress |
| Planification | APScheduler | Suffisant pour 5–8 chaînes MVP |
| Backend | FastAPI async | Compatible écosystème Python ML |
| Frontend | Next.js + Recharts | Recharts plus flexible que Tremor pour viz custom |

---

## Contraintes & risques connus

### Risque juridique — yt-dlp
Les CGU YouTube (section 5.1.H) interdisent le téléchargement sans permission explicite.
**Mitigation** : contacter TFM, RTS et 2STV pour accord de partenariat data avant lancement commercial. En échange : analyse gratuite 3 mois.

### Qualité ASR
Whisper large-v3 : ~85% précision français standard, ~70–75% sur français sénégalais avec insertions wolof.
**Mitigation** : paramètre `prompt` avec noms locaux. Fine-tuning prévu phase 2 avec données collectées.

### Délai pipeline
De la fin d'une émission à la disponibilité dans le dashboard : ~35–45 min.
(Délai publication YouTube + téléchargement + transcription + NLP)
Ce n'est pas du temps réel — acceptable pour le cas d'usage principal (analyse post-matinale).

### Scalabilité APScheduler
APScheduler est in-process : jobs perdus si redémarrage serveur.
Acceptable MVP (5–8 chaînes). Migration vers Celery + Redis si >10 chaînes ou workers multiples.

### Budget infra (5 chaînes, 3h/matinale, 6j/semaine)
- Whisper API : ~160 €/mois
- VPS Hetzner : 6 €/mois
- Supabase : 0–25 €/mois
- R2 + Railway + autres : ~10 €/mois
- **Total : ~180–200 €/mois**
Point mort : 1 client Starter (199 €/mois) couvre l'infra dès le 1er mois.

---

## Fonctionnalité différenciante — lecteur YouTube synchronisé

Chaque mention d'entité ou de mot-clé dans le dashboard doit être cliquable et ouvrir la vidéo YouTube au bon moment :

```
https://www.youtube.com/watch?v=VIDEO_ID&t=SECONDSs
```

Exemple : "Macky Sall cité à 08:23 sur TFM le 14/05/2026" → lien vers `?t=503s`

Cette fonctionnalité est la plus convaincante en démo. Aucun concurrent local ne la propose.

---

## Prochaine étape — script de validation MVP

Avant d'industrialiser, valider le pipeline de bout en bout sur une seule chaîne (TFM) :

1. Détecter la dernière matinale TFM via YouTube Data API
2. Télécharger l'audio avec yt-dlp
3. Transcrire avec Whisper (avec prompt de noms locaux)
4. Extraire les entités avec spaCy
5. Afficher les top 10 entités citées et les timestamps

Ce script de validation doit tourner en < 30 minutes sur un laptop standard.

---

## Ressources utiles

- YouTube Data API v3 docs : https://developers.google.com/youtube/v3/docs/playlistItems/list
- yt-dlp GitHub : https://github.com/yt-dlp/yt-dlp
- Whisper API docs : https://platform.openai.com/docs/guides/speech-to-text
- spaCy fr_core_news_lg : https://spacy.io/models/fr
- Supabase Python client : https://supabase.com/docs/reference/python
- Cloudflare R2 + boto3 : https://developers.cloudflare.com/r2/api/s3/api/
