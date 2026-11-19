# CLAUDE.md — Architecture et conventions

## Monorepo

- pnpm workspaces : `apps/*`, `packages/*`.
- `packages/game-core` est consommé **en source TypeScript** (pas de build) par l'API
  (Vitest/tsx) et par l'app (Metro).
- Commande de vérification complète : `pnpm check`.

## game-core : règles non négociables

1. **Pur et déterministe.** Aucune I/O, aucun `Date.now()`, aucun `Math.random()`.
   Le temps et l'aléa sont des paramètres (timestamps, seeds).
2. **Reproductible sur tous les moteurs JS** (V8, Hermes, JSC) : n'utiliser que `+ - * /`,
   `Math.floor/round/min/max/abs` et `Math.imul`. **Interdits dans la simulation :**
   `Math.pow` à exposant non entier, `Math.log`, `Math.exp`, `Math.sin`… (résultats
   non garantis identiques entre moteurs). Les courbes non linéaires sont des tables.
3. **Données dans `src/content/`**, typées, faciles à rééquilibrer. Le code ne contient
   pas de nombres magiques de gameplay hors `content/` et `constants.ts`.
4. Tout changement de règle de simulation qui modifie les sorties sur seeds fixes doit
   mettre à jour les snapshots **volontairement** (`vitest -u`) et le mentionner dans le commit.

## TypeScript

- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Imports de types avec `import type`.

## Commits

Conventional Commits : `feat(game-core): …`, `fix(api): …`, `chore: …`, `test: …`, `docs: …`.
Un commit = un changement cohérent.
