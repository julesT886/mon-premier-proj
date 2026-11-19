import { isDualClassUnlocked } from './build';
import { simulateCombat, type CombatLog } from './combat';
import { MAX_LEVEL, REST_BETWEEN_COMBATS_MS } from './constants';
import { CLASSES } from './content/classes';
import { killRewards, xpToNext } from './content/progression';
import { SKILLS } from './content/skills';
import { REGIONS, REGIONS_BY_ID } from './content/world';
import { offlineCapMs } from './monetization';
import { deriveSeed, Rng } from './rng';
import { heroSnapshot, type GameState } from './state';
import { makeEnemy } from './stats';
import type { ClassId, EnemyId, RegionId, RelicId, ResourceId, SkillId } from './types';

/** Taille d'une tranche de simulation. */
export const CHUNK_MS = 5 * 60 * 1000;
/** Combats réellement simulés par tranche (les autres sont extrapolés). */
export const SAMPLES_PER_CHUNK = 3;
export const RARE_DROP_CHANCE_PER_KILL = 0.002;
export const MERCHANT_CHANCE_PER_CHUNK = 0.012;
/** Délai entre deux tentatives sur un boss après un échec (6 tranches = 30 min). */
export const BOSS_RETRY_CHUNKS = 6;
const MAX_SAMPLE_LOGS = 5;

export type OfflineEvent =
  | { ts: number; type: 'level_up'; level: number }
  | { ts: number; type: 'skill_unlocked'; skillId: SkillId }
  | { ts: number; type: 'dual_class_unlocked'; classId: ClassId }
  | { ts: number; type: 'boss_defeated'; enemyId: EnemyId; region: RegionId }
  | { ts: number; type: 'boss_failed'; enemyId: EnemyId; region: RegionId }
  | { ts: number; type: 'region_unlocked'; region: RegionId }
  | { ts: number; type: 'rare_item'; relicId: RelicId }
  | { ts: number; type: 'treasure'; gold: number }
  | { ts: number; type: 'merchant'; gold: number; sold: number; resource: ResourceId };

export type OfflineEventType = OfflineEvent['type'];

export interface OfflineRewards {
  xp: number;
  resources: Record<ResourceId, number>;
  combats: number;
  kills: number;
  losses: number;
}

export interface OfflineResult {
  state: GameState;
  /** Temps réellement écoulé (borné à 0 si l'horloge recule). */
  elapsedMs: number;
  /** Temps pris en compte après plafond. */
  creditedMs: number;
  /** Temps perdu au-delà du plafond. */
  overflowMs: number;
  levelsGained: number;
  rewards: OfflineRewards;
  events: OfflineEvent[];
  /** Quelques combats échantillonnés (sans événements détaillés). */
  sampleCombats: CombatLog[];
  /** Combats de boss tentés pendant la période. */
  bossCombats: CombatLog[];
}

export interface OfflineOptions {
  /** Surcharge du plafond (sinon dérivé des droits du joueur : 12 h ou 16 h). */
  capMs?: number;
}

/**
 * Progression hors ligne, pure et déterministe.
 *
 * Le temps est découpé en tranches de CHUNK_MS indexées par `state.progress.chunkCounter`,
 * avec un reliquat (`carryMs`). Chaque tranche ne dépend que de l'état à son début et de
 * sa seed : appeler la fonction sur [t0, t1] puis [t1, t2] donne exactement le même
 * résultat que sur [t0, t2] (hors plafond).
 */
export function computeOfflineProgress(
  initial: GameState,
  lastSeenTs: number,
  nowTs: number,
  options: OfflineOptions = {},
): OfflineResult {
  const cap = options.capMs ?? offlineCapMs(initial.entitlements);
  const elapsedMs = Math.max(0, nowTs - lastSeenTs);
  const creditedMs = Math.min(elapsedMs, cap);
  const total = initial.progress.carryMs + creditedMs;
  const chunks = Math.floor(total / CHUNK_MS);

  let state = cloneState(initial);
  state.progress.carryMs = total - chunks * CHUNK_MS;

  const rewards: OfflineRewards = {
    xp: 0,
    resources: { gold: 0, moonsap: 0, embershard: 0, nacre: 0 },
    combats: 0,
    kills: 0,
    losses: 0,
  };
  const events: OfflineEvent[] = [];
  const sampleCombats: CombatLog[] = [];
  const bossCombats: CombatLog[] = [];
  const startLevel = state.hero.level;

  // Horodatage absolu de la fin de la tranche i (indépendant du découpage des appels).
  const chunkEndTs = (i: number) => lastSeenTs + (i + 1) * CHUNK_MS - initial.progress.carryMs;

  for (let i = 0; i < chunks; i++) {
    const ts = chunkEndTs(i);
    state = runChunk(state, ts, { rewards, events, sampleCombats, bossCombats });
    state.progress.chunkCounter += 1;
  }

  return {
    state,
    elapsedMs,
    creditedMs,
    overflowMs: elapsedMs - creditedMs,
    levelsGained: state.hero.level - startLevel,
    rewards,
    events,
    sampleCombats: sampleCombats.slice(-MAX_SAMPLE_LOGS),
    bossCombats,
  };
}

interface Accumulators {
  rewards: OfflineRewards;
  events: OfflineEvent[];
  sampleCombats: CombatLog[];
  bossCombats: CombatLog[];
}

function runChunk(state: GameState, ts: number, acc: Accumulators): GameState {
  const region = REGIONS_BY_ID[state.activeRegion];
  const progress = state.regions[region.id];
  const seed = deriveSeed(state.playerSeed, 'chunk', state.progress.chunkCounter);
  const rng = new Rng(seed);
  const hero = heroSnapshot(state);
  let budgetMs = CHUNK_MS;

  // 1. Tentative sur le boss si le seuil de victoires est atteint.
  if (
    !progress.bossDefeated &&
    progress.killsSinceBossAttempt >= region.bossKillThreshold &&
    state.progress.chunkCounter >= progress.bossRetryAtChunk
  ) {
    const boss = makeEnemy(region.boss, region.bossLevel);
    const log = simulateCombat(hero, boss, deriveSeed(seed, 'boss'), { recordEvents: false });
    acc.bossCombats.push(log);
    acc.rewards.combats += 1;
    state.lifetime.combats += 1;
    budgetMs -= log.durationMs + REST_BETWEEN_COMBATS_MS;
    if (log.outcome === 'win') {
      progress.bossDefeated = true;
      progress.killsSinceBossAttempt = 0;
      state.lifetime.bossesDefeated += 1;
      acc.events.push({ ts, type: 'boss_defeated', enemyId: region.boss, region: region.id });
      const r = killRewards(region.bossLevel, true);
      grant(state, acc, region.resource, r.xp, r.gold, r.material, ts);
      const next = REGIONS.find((x) => x.unlockedBy === region.id);
      if (next && !state.regions[next.id].unlocked) {
        state.regions[next.id].unlocked = true;
        acc.events.push({ ts, type: 'region_unlocked', region: next.id });
      }
      const relic = region.relics.find((id) => !state.relics.includes(id));
      if (relic) {
        state.relics.push(relic);
        acc.events.push({ ts, type: 'rare_item', relicId: relic });
      }
    } else {
      // Nouvelle tentative après un délai fixe.
      progress.bossRetryAtChunk = state.progress.chunkCounter + BOSS_RETRY_CHUNKS;
      acc.rewards.losses += 1;
      state.lifetime.losses += 1;
      acc.events.push({ ts, type: 'boss_failed', enemyId: region.boss, region: region.id });
    }
  }

  // 2. Combats normaux : SAMPLES_PER_CHUNK simulés, le reste extrapolé.
  let wins = 0;
  let durationSum = 0;
  let xpSum = 0;
  let goldSum = 0;
  let matSum = 0;
  for (let s = 0; s < SAMPLES_PER_CHUNK; s++) {
    const enemyId = rng.pick(region.enemies);
    const level = clamp(state.hero.level + rng.int(-1, 1), region.minLevel, region.maxLevel);
    const log = simulateCombat(hero, makeEnemy(enemyId, level), deriveSeed(seed, 'mob', s), {
      recordEvents: false,
    });
    acc.sampleCombats.push(log);
    if (acc.sampleCombats.length > MAX_SAMPLE_LOGS) acc.sampleCombats.shift();
    durationSum += log.durationMs + REST_BETWEEN_COMBATS_MS;
    if (log.outcome === 'win') {
      wins += 1;
      const r = killRewards(level, false);
      xpSum += r.xp;
      goldSum += r.gold;
      matSum += r.material;
    }
  }
  const avgCycle = Math.max(1, Math.round(durationSum / SAMPLES_PER_CHUNK));
  const combats = Math.max(0, Math.floor(Math.max(0, budgetMs) / avgCycle));
  const kills = Math.floor((combats * wins) / SAMPLES_PER_CHUNK);
  const losses = combats - kills;
  acc.rewards.combats += combats;
  acc.rewards.kills += kills;
  acc.rewards.losses += losses;
  state.lifetime.combats += combats;
  state.lifetime.kills += kills;
  state.lifetime.losses += losses;
  progress.kills += kills;
  progress.killsSinceBossAttempt += kills;
  if (wins > 0) {
    grant(
      state,
      acc,
      region.resource,
      Math.floor((xpSum * kills) / wins),
      Math.floor((goldSum * kills) / wins),
      Math.floor((matSum * kills) / wins),
      ts,
    );
  }

  // 3. Objet rare (approximation linéaire, plafonnée).
  if (kills > 0 && rng.chance(Math.min(0.5, kills * RARE_DROP_CHANCE_PER_KILL))) {
    const relic = region.relics.find((id) => !state.relics.includes(id));
    if (relic) {
      state.relics.push(relic);
      acc.events.push({ ts, type: 'rare_item', relicId: relic });
    } else {
      const gold = 50 * region.bossLevel;
      state.resources.gold += gold;
      acc.rewards.resources.gold += gold;
      acc.events.push({ ts, type: 'treasure', gold });
    }
  }

  // 4. Marchand de passage : rachète une partie du matériau de la région.
  if (rng.chance(MERCHANT_CHANCE_PER_CHUNK)) {
    const stock = state.resources[region.resource];
    const sold = Math.floor(stock / 4);
    const gold = sold > 0 ? sold * 3 : 10 * state.hero.level;
    state.resources[region.resource] -= sold;
    acc.rewards.resources[region.resource] -= sold;
    state.resources.gold += gold;
    acc.rewards.resources.gold += gold;
    acc.events.push({ ts, type: 'merchant', gold, sold, resource: region.resource });
  }

  return state;
}

function grant(
  state: GameState,
  acc: Accumulators,
  material: Exclude<ResourceId, 'gold'>,
  xp: number,
  gold: number,
  mat: number,
  ts: number,
) {
  state.resources.gold += gold;
  state.resources[material] += mat;
  acc.rewards.resources.gold += gold;
  acc.rewards.resources[material] += mat;
  acc.rewards.xp += xp;
  addXp(state, xp, ts, acc.events);
}

/** Ajoute de l'XP, gère les montées de niveau et les déblocages associés. */
export function addXp(state: GameState, xp: number, ts: number, events: OfflineEvent[]): void {
  state.hero.xp += xp;
  while (state.hero.level < MAX_LEVEL && state.hero.xp >= xpToNext(state.hero.level)) {
    state.hero.xp -= xpToNext(state.hero.level);
    const before = state.hero.level;
    state.hero.level += 1;
    events.push({ ts, type: 'level_up', level: state.hero.level });
    for (const skill of newlyUnlockedSkills(state.hero.classId, before, state.hero.level)) {
      events.push({ ts, type: 'skill_unlocked', skillId: skill });
    }
    if (!isDualClassUnlocked(before) && isDualClassUnlocked(state.hero.level)) {
      const other = (Object.keys(CLASSES) as ClassId[]).find((c) => c !== state.hero.classId);
      if (other) events.push({ ts, type: 'dual_class_unlocked', classId: other });
    }
  }
  if (state.hero.level >= MAX_LEVEL) state.hero.xp = 0;
}

function newlyUnlockedSkills(classId: ClassId, from: number, to: number): SkillId[] {
  return SKILLS.filter(
    (s) => s.classId === classId && s.requiredLevel > from && s.requiredLevel <= to,
  ).map((s) => s.id);
}

function clamp(x: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, x));
}

function cloneState(s: GameState): GameState {
  return {
    ...s,
    hero: { ...s.hero },
    build: { slots: [...s.build.slots] },
    skillRanks: { ...s.skillRanks },
    relics: [...s.relics],
    companions: [...s.companions],
    resources: { ...s.resources },
    regions: Object.fromEntries(
      Object.entries(s.regions).map(([k, v]) => [k, { ...v }]),
    ) as GameState['regions'],
    progress: { ...s.progress },
    entitlements: { ...s.entitlements, cosmetics: [...s.entitlements.cosmetics] },
    lifetime: { ...s.lifetime },
  };
}
