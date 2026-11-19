/**
 * Logique de session de jeu, sans dépendance React Native (testable avec Vitest).
 */
import {
  buildLocalRecap,
  computeOfflineProgress,
  heroSnapshot,
  localCoach,
  makeEnemy,
  REGIONS_BY_ID,
  simulateCombat,
  summarizeCombatLog,
  toCoachRequest,
  deriveSeed,
  Rng,
  type CoachAdvice,
  type CombatLog,
  type EvalTarget,
  type GameState,
  type Locale,
  type OfflineResult,
  type Recap,
  type RecapInput,
  type RecapTone,
} from '@brumeterre/game-core';
import type { ApiClient } from './api';

/** Au-delà de cette absence, on montre l'écran de récap au retour. */
export const RECAP_THRESHOLD_MS = 2 * 60 * 1000;
/** Délai max d'attente de l'IA pour le récap : au-delà, templates locaux. */
export const RECAP_CLIENT_TIMEOUT_MS = 4000;
export const COACH_CLIENT_TIMEOUT_MS = 15000;

export interface ResumeResult {
  result: OfflineResult;
  /** true si l'absence justifie l'écran « Récupérer » + récap. */
  showRecap: boolean;
}

export function resume(state: GameState, lastSeenTs: number, nowTs: number): ResumeResult {
  const result = computeOfflineProgress(state, lastSeenTs, nowTs);
  return { result, showRecap: result.elapsedMs >= RECAP_THRESHOLD_MS };
}

export function recapInputFrom(
  state: GameState,
  result: OfflineResult,
  tone: RecapTone,
): RecapInput {
  return {
    heroName: state.hero.name,
    region: state.activeRegion,
    companions: state.companions,
    tone,
    events: result.events,
    kills: result.rewards.kills,
    elapsedMs: result.creditedMs,
  };
}

/** Récap IA avec repli local garanti : ne rejette jamais, ne dépasse jamais `timeoutMs`. */
export async function fetchRecapWithFallback(
  api: ApiClient | null,
  input: RecapInput,
  locale: Locale,
  timeoutMs = RECAP_CLIENT_TIMEOUT_MS,
): Promise<Recap> {
  const local = () => buildLocalRecap({ ...input, locale });
  if (!api) return local();
  try {
    const res = await api.recap({ ...input, locale }, timeoutMs);
    return res.recap;
  } catch {
    return local();
  }
}

/** Cible d'évaluation pour le coach : le boss si non vaincu, sinon les monstres. */
export function coachTarget(state: GameState, log?: CombatLog): EvalTarget {
  if (log) return { kind: 'enemy', enemyId: log.enemy.enemyId, level: log.enemy.level };
  const region = REGIONS_BY_ID[state.activeRegion];
  return state.regions[region.id].bossDefeated
    ? { kind: 'region', region: region.id }
    : { kind: 'boss', region: region.id };
}

/** Combat de référence à analyser quand le joueur ouvre le coach depuis l'écran Build. */
export function referenceCombat(state: GameState, nonce: number): CombatLog {
  const region = REGIONS_BY_ID[state.activeRegion];
  const bossPending = !state.regions[region.id].bossDefeated;
  const enemy = bossPending
    ? makeEnemy(region.boss, region.bossLevel)
    : makeEnemy(
        region.enemies[nonce % region.enemies.length] as string,
        Math.min(region.maxLevel, Math.max(region.minLevel, state.hero.level)),
      );
  return simulateCombat(heroSnapshot(state), enemy, deriveSeed(state.playerSeed, 'coach', nonce));
}

export interface CoachOutcome {
  advice: CoachAdvice;
  source: 'ai' | 'cache' | 'local';
}

/** Coach IA avec repli sur le coach local (diagnostic + swaps mesurés). */
export async function fetchCoachWithFallback(
  api: ApiClient | null,
  state: GameState,
  log: CombatLog,
  locale: Locale,
  timeoutMs = COACH_CLIENT_TIMEOUT_MS,
): Promise<CoachOutcome> {
  const summary = summarizeCombatLog(log, locale);
  if (api) {
    try {
      const res = await api.coach(toCoachRequest(state, summary, locale), timeoutMs);
      return { advice: res.advice, source: res.source };
    } catch {
      // repli local ci-dessous
    }
  }
  const { advice } = localCoach(state, summary, coachTarget(state, log), locale);
  return { advice, source: 'local' };
}

/** Combat purement visuel pour l'écran d'accueil (déterministe par index). */
export function showcaseCombat(state: GameState, index: number): CombatLog {
  const region = REGIONS_BY_ID[state.activeRegion];
  const rng = new Rng(deriveSeed(state.playerSeed, 'show', index));
  const enemyId = rng.pick(region.enemies);
  const level = Math.min(
    region.maxLevel,
    Math.max(region.minLevel, state.hero.level + rng.int(-1, 1)),
  );
  return simulateCombat(
    heroSnapshot(state),
    makeEnemy(enemyId, level),
    deriveSeed(state.playerSeed, 'show-fight', index),
  );
}
