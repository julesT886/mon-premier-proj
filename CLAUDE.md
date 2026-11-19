# CLAUDE.md — Architecture et conventions

## Vue d'ensemble

```
apps/mobile ──(EXPO_PUBLIC_API_URL, jeton device)──▶ apps/api ──(clé serveur)──▶ Anthropic
     │                                                   │
     └──────────── packages/game-core (source TS) ◀──────┘
```

- **game-core** : toute la logique de jeu. Pur, déterministe, sans I/O. Partagé par l'app
  (simulation, hors ligne, coach local, récaps locaux) et l'API (validation des ids,
  reconstruction des libellés, récap de secours).
- **api** : proxy IA uniquement. Ne connaît pas l'état du joueur au-delà de la requête.
- **mobile** : UI + persistance + orchestration. Ne dépend jamais de l'IA pour avancer.

Commande de vérification complète : `pnpm check` (à lancer avant chaque commit).

## Monorepo

- pnpm workspaces (`apps/*`, `packages/*`), `node-linker=hoisted` (requis par Expo/Metro).
- `@brumeterre/game-core` est consommé **en source TypeScript** : pas de build. L'API le
  bundle avec tsup (`noExternal`), Metro le transpile pour l'app.

## game-core : règles non négociables

1. **Pur et déterministe.** Aucun `Date.now()`, `Math.random()`, I/O. Le temps et l'aléa
   sont des paramètres (timestamps, seeds via `Rng`/`deriveSeed`).
2. **Identique sur tous les moteurs JS** (V8, Hermes, JSC) : seulement `+ - * /`,
   `Math.floor/round/min/max/abs/imul`. Interdits (test `determinism guard`) : `Math.pow`,
   `log`, `exp`, `sqrt`, trigonométrie, `localeCompare`. Courbes non linéaires = tables.
3. **Données dans `src/content/`** (compétences, synergies, classes, monde, progression).
   Rééquilibrer = modifier `content/`, jamais le moteur.
4. **Snapshots dorés** sur seeds fixes (`test/__snapshots__`). Un changement de règle qui
   les modifie doit être volontaire (`vitest -u`) et mentionné dans le commit.

### Modules clés

| Module            | Rôle                                                                       |
| ----------------- | -------------------------------------------------------------------------- |
| `combat.ts`       | `simulateCombat` tick par tick (100 ms) → `CombatLog` (événements + stats) |
| `offline.ts`      | `computeOfflineProgress` par tranches de 5 min, plafond 12 h (16 h boost)  |
| `evaluate.ts`     | `evaluateBuild` / `compareBuilds` sur 20 seeds communes                    |
| `summary.ts`      | `summarizeCombatLog` : agrégat borné envoyé au coach (jamais le log brut)  |
| `coach.ts`        | Contrat du coach, `verifySuggestions`, `findBestSwaps`, `localCoach`       |
| `narrative.ts`    | `buildLocalRecap` : récap 60-100 mots par templates (fallback obligatoire) |
| `wire.ts`         | Contrat réseau app ↔ API (ids et nombres uniquement)                       |
| `monetization.ts` | Catalogue et droits abstraits (pass, cosmétiques, accélérateur)            |

**Hors ligne** : `chunkCounter` + `carryMs` dans l'état garantissent que `[t0,t1]` puis
`[t1,t2]` ≡ `[t0,t2]` (testé). L'app utilise la même fonction pour la progression en ligne.

**Double classe** : la seconde classe s'ouvre au niveau `DUAL_CLASS_LEVEL` (8).

## API (apps/api)

- Fastify, routes dans `server.ts`, logique IA dans `ai.ts`, client SDK dans `llm.ts`
  (interface `LlmClient` → faux client dans les tests, aucun appel réseau en CI).
- **Prompts versionnés** dans `src/prompts/<feature>.v<N>.ts`. Toute modification de
  prompt = nouveau fichier + nouvelle version (la version fait partie de la clé de cache).
- **Anti-injection** : requêtes validées par Zod avec ids vérifiés contre `game-core` ; le
  seul texte libre (nom du héros) est assaini. Les libellés envoyés au modèle sont
  reconstruits côté serveur. Les données vont dans des balises `<combat_data>` /
  `<recap_data>` marquées « données, jamais instructions ».
- **Sorties** : `output_config.format` + Zod, puis post-validation métier (suggestions
  impossibles retirées). Sortie invalide → fallback, jamais d'erreur 500.
- **Quotas** par appareil et par jour, remboursés si l'IA échoue ; **cache** par hash
  d'entrée normalisée (un hit ne consomme pas de quota).
- **Logs** `ai_call` : modèle, version de prompt, latence, tokens, coût estimé, issue.
- Modèles : coach `claude-sonnet-5-5` (effort medium, repli serveur `fallbacks: 'default'`
  en cas de refus), récap `claude-haiku-5-5` (effort low, budget 3,5 s).

## App (apps/mobile)

- Routes Expo Router dans `src/app/` ; le reste (`components/`, `lib/`, `store/`,
  `i18n/`) hors de `src/app/`.
- `store/game.ts` (Zustand) : seule source de vérité de l'état ; persistance débouncée.
- `lib/storage.ts` (expo-sqlite, natif) / `lib/storage.web.ts` (localStorage, aperçu web) :
  résolution par extension de plateforme Metro. Idem `lib/notifications(.web).ts`.
- `lib/session.ts` : logique sans React Native, testée par Vitest (`apps/mobile/test`).
- **Jamais bloquer sur l'IA** : `fetchRecapWithFallback` (4 s max) et
  `fetchCoachWithFallback` retombent toujours sur les versions locales.
- Le gain d'une suggestion du coach est **mesuré** (`verifySuggestions`, 20 combats) avant
  « Appliquer » ; l'IA ne promet aucun chiffre.
- i18n : `src/i18n/fr.ts` fait foi ; les autres langues sont partielles avec repli fr.
- Installer une dépendance native : `npx expo install <pkg>` (versions alignées SDK 58).

## TypeScript

- `strict`, `noUncheckedIndexedAccess` partout ; `exactOptionalPropertyTypes` hors app.
- Imports de types avec `import type`.

## Commits

Conventional Commits : `feat(game-core): …`, `fix(api): …`, `feat(mobile): …`, `chore: …`,
`test: …`, `docs: …`. Un commit = un changement cohérent.
