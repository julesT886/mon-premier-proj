# Brumeterre

Idle RPG mobile (iOS/Android) : exploration par régions, double classe Guerrier/Mage,
combats automatiques, progression hors ligne, et une couche IA qui **explique les combats**
(coach de build) et **raconte ce qui s'est passé pendant ton absence** (récap narratif).

Univers 100 % original : Brumeterre, monde noyé de brume où les « Égarés » se réveillent
sans souvenirs. Trois régions : Bois-Murmure (forêt), Cœur-de-Braise (volcan), Côte des
Sel-Lunes (côte).

**Le jeu est 100 % jouable sans réseau ni IA** : sans API, le coach et les récaps basculent
sur des versions locales (diagnostic + simulation, templates narratifs).

## Structure

```
apps/
  mobile/       App Expo SDK 58 (Expo Router, Zustand, expo-sqlite, Reanimated)
  api/          Backend Fastify : proxy IA, quotas, cache, prompts versionnés
packages/
  game-core/    Moteur pur et déterministe (combat, hors ligne, coach local, récaps)
scripts/        Vérifications (absence de secrets dans le client)
```

## Prérequis

- Node.js ≥ 22, pnpm 10 (`corepack enable`)
- Pour l'app : Expo Go ou un development build (`npx expo run:ios|android`), ou un navigateur

## Installation

```bash
pnpm install
cp .env.example .env            # API : clé Anthropic + secret des jetons
cp .env.example apps/mobile/.env  # App : seulement EXPO_PUBLIC_API_URL (optionnel)
```

## Commandes

| Commande                                 | Effet                                               |
| ---------------------------------------- | --------------------------------------------------- |
| `pnpm check`                             | format + lint + typecheck + tests + scan de secrets |
| `pnpm test`                              | Tests Vitest (game-core, api, logique de l'app)     |
| `pnpm lint` / `pnpm typecheck`           | ESLint (0 warning) / `tsc --noEmit` partout         |
| `pnpm secrets:check`                     | Échoue si un secret apparaît côté client            |
| `pnpm --filter @brumeterre/api dev`      | API en local (rechargement auto) sur `:8787`        |
| `pnpm --filter @brumeterre/api build`    | Bundle de production `apps/api/dist/index.js`       |
| `pnpm --filter @brumeterre/mobile start` | Serveur Expo (iOS, Android, web)                    |
| `pnpm --filter @brumeterre/mobile web`   | Aperçu navigateur                                   |

## Variables d'environnement

Voir [`.env.example`](./.env.example).

| Variable                                  | Où  | Rôle                                                |
| ----------------------------------------- | --- | --------------------------------------------------- |
| `ANTHROPIC_API_KEY`                       | API | Clé Anthropic. Absente → l'API sert les fallbacks   |
| `DEVICE_TOKEN_SECRET`                     | API | Secret HMAC des jetons device (≥ 16 caractères)     |
| `COACH_MODEL` / `RECAP_MODEL`             | API | `claude-sonnet-5-5` / `claude-haiku-5-5` par défaut |
| `COACH_DAILY_LIMIT` / `RECAP_DAILY_LIMIT` | API | Quotas quotidiens par appareil (20 / 3)             |
| `RECAP_TIMEOUT_MS`                        | API | Budget du récap IA côté serveur (3,5 s)             |
| `EXPO_PUBLIC_API_URL`                     | App | URL de l'API. Vide → jeu entièrement hors ligne     |

**Règle absolue :** la clé Anthropic ne vit que dans `apps/api`. Tout ce qui commence par
`EXPO_PUBLIC_` est embarqué dans l'app et donc public.

## Essayer l'app dans le navigateur (GitHub Pages)

Version web publique, jouable hors ligne (coach et récaps en version locale, sans IA) :
**https://julest886.github.io/mon-premier-proj/**

Le workflow `.github/workflows/pages.yml` la republie à chaque mise à jour de `main`.
Activation unique : **Settings → Pages → Source : « GitHub Actions »**, puis relancer le
workflow « Deploy web preview to GitHub Pages » (onglet Actions) ou pousser sur `main`.

En local, la même version sous un sous-chemin :
`EXPO_BASE_URL=/mon-premier-proj npx expo export --platform web` (dans `apps/mobile`).

## Déploiement de l'API (Fly.io)

```bash
fly launch --no-deploy --config apps/api/fly.toml
fly secrets set ANTHROPIC_API_KEY=... DEVICE_TOKEN_SECRET=... --config apps/api/fly.toml
fly deploy --config apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

Sur Railway : même `Dockerfile`, contexte de build = racine du repo.
Quotas et cache sont en mémoire : garder une seule instance au MVP, ou brancher Redis via
les interfaces `QuotaStore` et `ResponseCache` (`apps/api/src/limits.ts`).

## Endpoints

| Route               | Rôle                                                                  |
| ------------------- | --------------------------------------------------------------------- |
| `GET /health`       | Santé                                                                 |
| `POST /auth/device` | `{ deviceId }` → `{ token }` (jeton anonyme signé)                    |
| `POST /ai/coach`    | Analyse de combat ; 429 quota, 503 IA indisponible (→ coach local)    |
| `POST /ai/recap`    | Récap narratif ; répond toujours 200 (templates si IA lente/en échec) |

## Documentation technique

Voir [`CLAUDE.md`](./CLAUDE.md) : architecture, règles du moteur, conventions.
