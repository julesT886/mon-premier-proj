/**
 * XP nécessaire pour passer du niveau L au niveau L+1 (index 0 = niveau 1).
 * Table précalculée (premiers niveaux rapides pour l'onboarding, ≈ 3 semaines pour le niveau 30) : pas de puissance flottante
 * dans la simulation, pour un résultat identique sur tous les moteurs JS.
 */
export const XP_TO_NEXT: readonly number[] = [
  70, 280, 1130, 3280, 8160, 11840, 16280, 21480, 27560, 34480, 42280, 51000, 60600, 71200, 82760,
  95280, 108800, 123400, 139000, 155640, 173360, 192200, 212120, 233120, 255280, 278600, 303080,
  328680, 355520,
];

export function xpToNext(level: number): number {
  return XP_TO_NEXT[level - 1] ?? Infinity;
}

/** Courbes de stats des ennemis (multipliées par les coefficients de chaque EnemyDef). */
export const ENEMY_SCALING = {
  hpBase: 80,
  hpPerLevel: 36,
  attackBase: 7,
  attackPerLevel: 2.0,
  armorBase: 4,
  armorPerLevel: 1.6,
  resistBase: 4,
  resistPerLevel: 1.2,
  critChance: 0.05,
  critMult: 1.5,
} as const;

/** Récompenses par victoire selon le niveau de l'ennemi. */
export function killRewards(enemyLevel: number, isBoss: boolean) {
  const mult = isBoss ? 10 : 1;
  return {
    xp: (8 + 4 * enemyLevel) * mult,
    gold: (3 + 2 * enemyLevel) * mult,
    material: (1 + Math.floor(enemyLevel / 5)) * mult,
  };
}

/** Coût en or pour passer une compétence du rang `currentRank` au suivant. */
export function skillUpgradeCost(currentRank: number): number {
  return [0, 1000, 5000, 20000, 60000][currentRank] ?? Infinity;
}
