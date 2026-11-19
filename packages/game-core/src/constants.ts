/** Pas de simulation du combat, en ms. */
export const TICK_MS = 100;
/** Global cooldown du héros entre deux compétences. */
export const GCD_MS = 1000;
/** Durée max d'un combat normal / de boss avant défaite par épuisement. */
export const MAX_COMBAT_MS = 60_000;
export const MAX_BOSS_COMBAT_MS = 90_000;
/** Intervalle de tick des dégâts sur la durée. */
export const DOT_INTERVAL_MS = 1000;
/** Repos entre deux combats (le héros se soigne entièrement). */
export const REST_BETWEEN_COMBATS_MS = 4000;

/** Niveau auquel la seconde classe se débloque (double classe). */
export const DUAL_CLASS_LEVEL = 8;
export const MAX_LEVEL = 30;
export const MAX_SKILL_RANK = 5;
/** Bonus de puissance par rang de compétence au-delà du rang 1. */
export const SKILL_RANK_BONUS = 0.1;

/** Réduction : dégâts × 100 / (100 + défense). */
export const MITIGATION_K = 100;
/** Les résistances par école sont bornées pour éviter l'immunité. */
export const MAX_RESIST_PCT = 0.75;
