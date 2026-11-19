# Brumeterre

Idle RPG mobile (iOS/Android) : exploration par régions, double classe Guerrier/Mage,
combats automatiques, progression hors ligne, et une couche IA qui **explique les combats**
et **raconte ce qui s'est passé pendant ton absence**.

Univers 100 % original.

## Structure

```
apps/
  api/          Backend Fastify (proxy IA, rate limit, cache) — jalons J3-J4
  mobile/       App Expo / React Native — jalons J5-J7
packages/
  game-core/    Moteur de jeu pur, déterministe, sans dépendance UI
```

## Prérequis

- Node.js ≥ 22
- pnpm 10 (`corepack enable`)

## Installation

```bash
pnpm install
cp .env.example .env   # puis renseigner les variables (voir ci-dessous)
```

## Commandes

| Commande         | Effet                                         |
| ---------------- | --------------------------------------------- |
| `pnpm test`      | Tests Vitest de tous les packages             |
| `pnpm lint`      | ESLint (0 warning toléré)                     |
| `pnpm typecheck` | `tsc --noEmit` dans chaque package            |
| `pnpm format`    | Prettier en écriture                          |
| `pnpm check`     | format + lint + typecheck + tests (CI locale) |

## Variables d'environnement

Voir [`.env.example`](./.env.example). Règle absolue : la clé Anthropic ne vit **que** dans
`apps/api`. L'app mobile ne connaît que `EXPO_PUBLIC_API_URL`.

## Documentation technique

Voir [`CLAUDE.md`](./CLAUDE.md) pour l'architecture et les conventions.
