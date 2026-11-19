import { CLASSES } from './content/classes';
import { ENEMY_SCALING } from './content/progression';
import { getEnemy, RELICS_BY_ID } from './content/world';
import type { ClassId, EnemyId, EnemySnapshot, Modifiers, RelicId, Stats } from './types';

export function emptyModifiers(): Modifiers {
  return {
    attackPct: 0,
    spellPowerPct: 0,
    hastePct: 0,
    critChance: 0,
    armorPct: 0,
    damagePct: 0,
    firePct: 0,
    icePct: 0,
    healingPct: 0,
    buffDurationPct: 0,
    fireVsChilledPct: 0,
    damageTakenPct: 0,
  };
}

export function addModifiers(target: Modifiers, extra: Partial<Modifiers>): Modifiers {
  for (const key of Object.keys(extra) as (keyof Modifiers)[]) {
    target[key] += extra[key] ?? 0;
  }
  return target;
}

/** Stats du héros pour une classe de départ, un niveau et des reliques possédées. */
export function heroStats(classId: ClassId, level: number, relics: readonly RelicId[] = []): Stats {
  const def = CLASSES[classId];
  const n = level - 1;
  const stats: Stats = {
    maxHp: Math.round(def.base.maxHp + def.perLevel.maxHp * n),
    attack: round1(def.base.attack + def.perLevel.attack * n),
    spellPower: round1(def.base.spellPower + def.perLevel.spellPower * n),
    armor: round1(def.base.armor + def.perLevel.armor * n),
    resist: round1(def.base.resist + def.perLevel.resist * n),
    critChance: def.base.critChance,
    critMult: def.base.critMult,
    attackIntervalMs: def.base.attackIntervalMs,
  };
  for (const relicId of relics) {
    const relic = RELICS_BY_ID[relicId];
    if (!relic) continue;
    for (const [key, value] of Object.entries(relic.bonus) as [keyof Stats, number][]) {
      stats[key] = round1(stats[key] + value);
    }
  }
  return stats;
}

export function enemyStats(enemyId: EnemyId, level: number): Stats {
  const def = getEnemy(enemyId);
  const s = ENEMY_SCALING;
  return {
    maxHp: Math.round((s.hpBase + s.hpPerLevel * level) * def.hpMult),
    attack: round1((s.attackBase + s.attackPerLevel * level) * def.attackMult),
    spellPower: 0,
    armor: round1((s.armorBase + s.armorPerLevel * level) * def.armorMult),
    resist: round1(s.resistBase + s.resistPerLevel * level),
    critChance: s.critChance,
    critMult: s.critMult,
    attackIntervalMs: def.attackIntervalMs,
  };
}

export function makeEnemy(enemyId: EnemyId, level: number): EnemySnapshot {
  return { enemyId, level, stats: enemyStats(enemyId, level) };
}

function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
