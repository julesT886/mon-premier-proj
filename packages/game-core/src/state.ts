import { starterBuild } from './build';
import { MAX_SKILL_RANK } from './constants';
import { CLASSES } from './content/classes';
import { skillUpgradeCost } from './content/progression';
import { REGIONS, REGIONS_BY_ID } from './content/world';
import { defaultEntitlements, type Entitlements } from './monetization';
import { heroStats } from './stats';
import type {
  Build,
  ClassId,
  CompanionId,
  HeroSnapshot,
  RegionId,
  RelicId,
  ResourceId,
  SkillId,
} from './types';
import { isBuildValid } from './build';

export const STATE_VERSION = 1;

export interface RegionProgress {
  unlocked: boolean;
  bossDefeated: boolean;
  kills: number;
  /** Victoires depuis la dernière tentative sur le boss. */
  killsSinceBossAttempt: number;
  /** Index de tranche à partir duquel une nouvelle tentative est permise. */
  bossRetryAtChunk: number;
}

export interface GameState {
  version: typeof STATE_VERSION;
  /** Seed personnelle : toute la progression en dérive. */
  playerSeed: string;
  hero: { name: string; classId: ClassId; level: number; xp: number };
  build: Build;
  skillRanks: Record<SkillId, number>;
  relics: RelicId[];
  companions: CompanionId[];
  resources: Record<ResourceId, number>;
  activeRegion: RegionId;
  regions: Record<RegionId, RegionProgress>;
  /** Curseurs de la simulation par tranches (garantit 2×6 h ≡ 12 h). */
  progress: { chunkCounter: number; carryMs: number };
  entitlements: Entitlements;
  lifetime: { combats: number; kills: number; losses: number; bossesDefeated: number };
}

export interface NewGameInput {
  heroName: string;
  classId: ClassId;
  playerSeed: string;
}

export function createNewGame({ heroName, classId, playerSeed }: NewGameInput): GameState {
  const regions = Object.fromEntries(
    REGIONS.map((r) => [
      r.id,
      {
        unlocked: r.unlockedBy === null,
        bossDefeated: false,
        kills: 0,
        killsSinceBossAttempt: 0,
        bossRetryAtChunk: 0,
      },
    ]),
  ) as Record<RegionId, RegionProgress>;
  return {
    version: STATE_VERSION,
    playerSeed,
    hero: { name: heroName, classId, level: 1, xp: 0 },
    build: starterBuild(CLASSES[classId].starterSkills),
    skillRanks: {},
    relics: [],
    companions: [REGIONS_BY_ID.forest.companion],
    resources: { gold: 0, moonsap: 0, embershard: 0, nacre: 0 },
    activeRegion: 'forest',
    regions,
    progress: { chunkCounter: 0, carryMs: 0 },
    entitlements: defaultEntitlements(),
    lifetime: { combats: 0, kills: 0, losses: 0, bossesDefeated: 0 },
  };
}

export function heroSnapshot(state: GameState, build: Build = state.build): HeroSnapshot {
  return {
    classId: state.hero.classId,
    level: state.hero.level,
    stats: heroStats(state.hero.classId, state.hero.level, state.relics),
    build,
    skillRanks: state.skillRanks,
  };
}

// ---------------------------------------------------------------------------
// Actions joueur (pures : renvoient un nouvel état ou une erreur)
// ---------------------------------------------------------------------------

export type ActionResult = { ok: true; state: GameState } | { ok: false; error: string };

export function applyBuild(state: GameState, build: Build): ActionResult {
  if (!isBuildValid(build, state.hero.classId, state.hero.level)) {
    return { ok: false, error: 'invalid_build' };
  }
  return { ok: true, state: { ...state, build: { slots: [...build.slots] } } };
}

export function travelTo(state: GameState, region: RegionId): ActionResult {
  const progress = state.regions[region];
  if (!progress.unlocked) return { ok: false, error: 'region_locked' };
  const companion = REGIONS_BY_ID[region].companion;
  const companions = state.companions.includes(companion)
    ? state.companions
    : [...state.companions, companion];
  return { ok: true, state: { ...state, activeRegion: region, companions } };
}

export function upgradeSkill(state: GameState, skillId: SkillId): ActionResult {
  const rank = state.skillRanks[skillId] ?? 1;
  if (rank >= MAX_SKILL_RANK) return { ok: false, error: 'max_rank' };
  const cost = skillUpgradeCost(rank);
  if (state.resources.gold < cost) return { ok: false, error: 'not_enough_gold' };
  return {
    ok: true,
    state: {
      ...state,
      resources: { ...state.resources, gold: state.resources.gold - cost },
      skillRanks: { ...state.skillRanks, [skillId]: rank + 1 },
    },
  };
}

export function grantEntitlements(state: GameState, entitlements: Entitlements): GameState {
  return { ...state, entitlements };
}

/** Restaure un état sérialisé (JSON) en vérifiant la version. */
export function parseSavedState(raw: unknown): GameState | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const s = raw as Partial<GameState>;
  if (s.version !== STATE_VERSION || typeof s.playerSeed !== 'string' || !s.hero) return null;
  return s as GameState;
}
