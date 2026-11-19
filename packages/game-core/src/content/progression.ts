/**
 * XP nécessaire pour passer du niveau L au niveau L+1 (index 0 = niveau 1).
 * Table précalculée (≈ 52 h de jeu cumulé pour le niveau 30) : pas de puissance flottante
 * dans la simulation, pour un résultat identique sur tous les moteurs JS.
 */
export const XP_TO_NEXT: readonly number[] = [
  110, 350, 750, 1310, 2040, 2960, 4070, 5370, 6890, 8620, 10570, 12750, 15150, 17800, 20690, 23820,
  27200, 30850, 34750, 38910, 43340, 48050, 53030, 58280, 63820, 69650, 75770, 82170, 88880,
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
  return [0, 150, 600, 2000, 6000][currentRank] ?? Infinity;
}
