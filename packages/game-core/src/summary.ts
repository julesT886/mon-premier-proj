import type { CombatLog } from './combat';
import { SKILLS_BY_ID } from './content/skills';
import { SYNERGIES } from './content/synergies';
import { getEnemy } from './content/world';
import { evaluateSynergies } from './synergy';
import type { EnemyAbility, Locale, Localized, School, SkillId, Tag } from './types';

/**
 * Résumé agrégé d'un combat pour le coach IA : jamais le log brut.
 * Tout est borné en taille (top 3, 4 slots, synergies connues).
 */
export interface CombatSummary {
  outcome: CombatLog['outcome'];
  endReason: CombatLog['endReason'];
  durationS: number;
  hero: { classId: string; level: number; hpLeftPct: number };
  enemy: {
    id: string;
    name: string;
    level: number;
    isBoss: boolean;
    hpLeftPct: number;
    resistances: Partial<Record<School, number>>;
  };
  slots: {
    slot: number;
    skillId: SkillId | null;
    name: string | null;
    tags: Tag[];
    casts: number;
    damage: number;
    damageSharePct: number;
  }[];
  topDamage: { sourceId: string; name: string; damage: number; sharePct: number }[];
  deathCauses: { sourceId: string; name: string; damage: number; sharePct: number }[];
  idleTimeS: number;
  idlePct: number;
  unusedSkills: SkillId[];
  synergies: {
    active: { id: string; name: string }[];
    nearlyActive: { id: string; name: string; missing: number }[];
  };
  defense: { healingDone: number; shieldAbsorbed: number };
}

const bySizeThenId = (a: [string, number], b: [string, number]) =>
  b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
const t = (l: Localized, locale: Locale) => l[locale] ?? l.fr;
const pct = (a: number, b: number) => (b <= 0 ? 0 : Math.round((a / b) * 1000) / 10);

function heroSourceName(id: string, locale: Locale): string {
  if (id === 'basic') return locale === 'fr' ? 'Attaque de base' : 'Basic attack';
  const skill = SKILLS_BY_ID[id];
  return skill ? t(skill.name, locale) : id;
}

function enemySourceName(id: string, abilities: readonly EnemyAbility[], locale: Locale) {
  if (id === 'basic') return locale === 'fr' ? 'Attaque de base' : 'Basic attack';
  const index = Number(id.split(':')[1]);
  const ability = abilities[index];
  return ability ? t(ability.name, locale) : id;
}

export function summarizeCombatLog(log: CombatLog, locale: Locale = 'fr'): CombatSummary {
  const enemyDef = getEnemy(log.enemy.enemyId);
  const dealt = log.stats.totalDamageDealt;
  const taken = log.stats.totalDamageTaken;

  const topDamage = Object.entries(log.stats.damageBySource)
    .sort(bySizeThenId)
    .slice(0, 3)
    .map(([sourceId, damage]) => ({
      sourceId,
      name: heroSourceName(sourceId, locale),
      damage,
      sharePct: pct(damage, dealt),
    }));

  const deathCauses = Object.entries(log.stats.damageTakenBySource)
    .sort(bySizeThenId)
    .slice(0, 3)
    .map(([sourceId, damage]) => ({
      sourceId,
      name: enemySourceName(sourceId, enemyDef.abilities, locale),
      damage,
      sharePct: pct(damage, taken),
    }));

  const slots = log.build.map((skillId, slot) => {
    const skill = skillId ? SKILLS_BY_ID[skillId] : undefined;
    const damage = skillId ? (log.stats.damageBySource[skillId] ?? 0) : 0;
    return {
      slot,
      skillId,
      name: skill ? t(skill.name, locale) : null,
      tags: skill ? [...skill.tags] : [],
      casts: skillId ? (log.stats.castsBySkill[skillId] ?? 0) : 0,
      damage,
      damageSharePct: pct(damage, dealt),
    };
  });

  const statuses = evaluateSynergies({ slots: log.build });
  const synergyName = (id: string) => {
    const def = SYNERGIES.find((s) => s.id === id);
    return def ? t(def.name, locale) : id;
  };

  return {
    outcome: log.outcome,
    endReason: log.endReason,
    durationS: Math.round(log.durationMs / 100) / 10,
    hero: {
      classId: log.hero.classId,
      level: log.hero.level,
      hpLeftPct: pct(log.hero.hpLeft, log.hero.maxHp),
    },
    enemy: {
      id: log.enemy.enemyId,
      name: t(enemyDef.name, locale),
      level: log.enemy.level,
      isBoss: log.enemy.isBoss,
      hpLeftPct: pct(log.enemy.hpLeft, log.enemy.maxHp),
      resistances: { ...enemyDef.resistPct },
    },
    slots,
    topDamage,
    deathCauses,
    idleTimeS: Math.round(log.stats.idleTimeMs / 100) / 10,
    idlePct: pct(log.stats.idleTimeMs, log.durationMs),
    unusedSkills: slots.filter((s) => s.skillId && s.casts === 0).map((s) => s.skillId as SkillId),
    synergies: {
      active: statuses.filter((s) => s.active).map((s) => ({ id: s.id, name: synergyName(s.id) })),
      nearlyActive: statuses
        .filter((s) => !s.active && s.missing === 1)
        .map((s) => ({ id: s.id, name: synergyName(s.id), missing: s.missing })),
    },
    defense: { healingDone: log.stats.healingDone, shieldAbsorbed: log.stats.shieldAbsorbed },
  };
}
