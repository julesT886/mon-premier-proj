import { isBuildValid } from './build';
import { simulateCombat } from './combat';
import { REGIONS_BY_ID } from './content/world';
import { deriveSeed } from './rng';
import { heroSnapshot, type GameState } from './state';
import { makeEnemy } from './stats';
import type { Build, EnemyId, RegionId } from './types';

export const DEFAULT_EVAL_RUNS = 20;

export type EvalTarget =
  | { kind: 'enemy'; enemyId: EnemyId; level: number }
  | { kind: 'boss'; region: RegionId }
  | { kind: 'region'; region: RegionId };

export interface BuildEvaluation {
  runs: number;
  wins: number;
  winRate: number;
  avgDurationMs: number;
  /** DPS moyen du héros (dégâts totaux / durée). */
  avgDps: number;
  /** PV restants moyens en fin de combat, en fraction des PV max (0 si défaite). */
  avgHpLeftPct: number;
  /** PV restants moyens de l'ennemi en fin de combat (fraction). Mesure du progrès quand on perd. */
  avgEnemyHpLeftPct: number;
}

function targetFor(target: EvalTarget, heroLevel: number, i: number) {
  switch (target.kind) {
    case 'enemy':
      return makeEnemy(target.enemyId, target.level);
    case 'boss': {
      const r = REGIONS_BY_ID[target.region];
      return makeEnemy(r.boss, r.bossLevel);
    }
    case 'region': {
      const r = REGIONS_BY_ID[target.region];
      const id = r.enemies[i % r.enemies.length] as EnemyId;
      return makeEnemy(id, Math.min(r.maxLevel, Math.max(r.minLevel, heroLevel)));
    }
  }
}

/**
 * Simule `runs` combats seedés (seeds communes à tous les builds évalués, pour
 * une comparaison équitable) et agrège les résultats.
 */
export function evaluateBuild(
  state: GameState,
  build: Build,
  target: EvalTarget,
  runs: number = DEFAULT_EVAL_RUNS,
): BuildEvaluation {
  const hero = heroSnapshot(state, build);
  let wins = 0;
  let duration = 0;
  let dps = 0;
  let hpLeft = 0;
  let enemyHpLeft = 0;
  for (let i = 0; i < runs; i++) {
    const enemy = targetFor(target, state.hero.level, i);
    const log = simulateCombat(hero, enemy, deriveSeed('eval', i), { recordEvents: false });
    if (log.outcome === 'win') wins += 1;
    duration += log.durationMs;
    dps += log.stats.totalDamageDealt / Math.max(0.1, log.durationMs / 1000);
    hpLeft += log.hero.hpLeft / log.hero.maxHp;
    enemyHpLeft += log.enemy.hpLeft / log.enemy.maxHp;
  }
  return {
    runs,
    wins,
    winRate: wins / runs,
    avgDurationMs: Math.round(duration / runs),
    avgDps: Math.round((dps / runs) * 10) / 10,
    avgHpLeftPct: Math.round((hpLeft / runs) * 1000) / 1000,
    avgEnemyHpLeftPct: Math.round((enemyHpLeft / runs) * 1000) / 1000,
  };
}

export interface BuildComparison {
  before: BuildEvaluation;
  after: BuildEvaluation;
  /** Différence mesurée en points de taux de victoire (−1..1). */
  winRateDelta: number;
  dpsDeltaPct: number;
  durationDeltaPct: number;
  /** Variation des PV restants de l'ennemi (fraction ; négatif = ennemi plus entamé). */
  enemyHpDelta: number;
  /** Le build proposé est-il utilisable par le héros ? */
  valid: boolean;
  /**
   * Amélioration mesurée : plus de victoires ; à victoires égales, plus de DPS ; et si tout
   * est perdu des deux côtés, un ennemi plus entamé (mourir plus vite n'est pas un progrès).
   */
  improved: boolean;
}

export function compareBuilds(
  state: GameState,
  from: Build,
  to: Build,
  target: EvalTarget,
  runs: number = DEFAULT_EVAL_RUNS,
): BuildComparison {
  const valid = isBuildValid(to, state.hero.classId, state.hero.level);
  const before = evaluateBuild(state, from, target, runs);
  const after = valid ? evaluateBuild(state, to, target, runs) : before;
  const winRateDelta = after.winRate - before.winRate;
  const pct = (a: number, b: number) => (b === 0 ? 0 : Math.round(((a - b) / b) * 1000) / 1000);
  const dpsDeltaPct = pct(after.avgDps, before.avgDps);
  const durationDeltaPct = pct(after.avgDurationMs, before.avgDurationMs);
  const enemyHpDelta =
    Math.round((after.avgEnemyHpLeftPct - before.avgEnemyHpLeftPct) * 1000) / 1000;
  // Toutes les tentatives perdues des deux côtés : le progrès, c'est d'entamer davantage
  // l'ennemi (et non de taper plus vite en mourant plus tôt). Sinon : plus de DPS.
  const sameOutcomeBetter = () =>
    before.winRate === 0 && after.winRate === 0 ? enemyHpDelta < -0.02 : dpsDeltaPct > 0.02;
  return {
    before,
    after,
    winRateDelta,
    dpsDeltaPct,
    durationDeltaPct,
    enemyHpDelta,
    valid,
    improved: valid && (winRateDelta > 0 || (winRateDelta === 0 && sameOutcomeBetter())),
  };
}
