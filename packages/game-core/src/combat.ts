import {
  DOT_INTERVAL_MS,
  GCD_MS,
  MAX_BOSS_COMBAT_MS,
  MAX_COMBAT_MS,
  MAX_RESIST_PCT,
  MITIGATION_K,
  SKILL_RANK_BONUS,
  TICK_MS,
} from './constants';
import { CLASSES } from './content/classes';
import { getSkill } from './content/skills';
import { getEnemy } from './content/world';
import { Rng } from './rng';
import { addModifiers, emptyModifiers } from './stats';
import { activeSynergies } from './synergy';
import type {
  DotId,
  EnemyAbility,
  EnemyDef,
  EnemySnapshot,
  HeroSnapshot,
  ModifierKey,
  Modifiers,
  School,
  Scaling,
  SkillDef,
  SkillId,
  Stats,
  StatusId,
  SynergyId,
} from './types';

// ---------------------------------------------------------------------------
// Types publics du journal de combat
// ---------------------------------------------------------------------------

export type Actor = 'hero' | 'enemy';
/** Source côté héros : `basic` ou un SkillId. Côté ennemi : `basic` ou `ability:<index>`. */
export type SourceId = string;

export type CombatEvent =
  | { t: number; type: 'cast'; actor: Actor; sourceId: SourceId }
  | {
      t: number;
      type: 'damage';
      actor: Actor;
      sourceId: SourceId;
      amount: number;
      absorbed: number;
      crit: boolean;
      school: School;
      dot: boolean;
    }
  | { t: number; type: 'heal'; actor: Actor; sourceId: SourceId; amount: number }
  | { t: number; type: 'shield'; actor: Actor; sourceId: SourceId; amount: number }
  | {
      t: number;
      type: 'buff';
      actor: Actor;
      sourceId: SourceId;
      modifier: ModifierKey | 'enrage';
      value: number;
      durationMs: number;
    }
  | {
      t: number;
      type: 'status';
      actor: Actor;
      sourceId: SourceId;
      status: StatusId;
      value: number;
      durationMs: number;
    }
  | { t: number; type: 'death'; actor: Actor };

export type CombatOutcome = 'win' | 'loss';
export type EndReason = 'enemyDefeated' | 'heroDefeated' | 'timeout';

export interface CombatStats {
  /** Dégâts infligés par le héros, par source (`basic` ou SkillId). */
  damageBySource: Record<SourceId, number>;
  dpsBySource: Record<SourceId, number>;
  castsBySkill: Record<SkillId, number>;
  totalDamageDealt: number;
  /** Dégâts reçus par le héros, par source ennemie. */
  damageTakenBySource: Record<SourceId, number>;
  totalDamageTaken: number;
  healingDone: number;
  shieldAbsorbed: number;
  /** Temps où le GCD était prêt mais aucune compétence n'était disponible. */
  idleTimeMs: number;
  activeSynergies: SynergyId[];
}

export interface CombatLog {
  seed: string;
  outcome: CombatOutcome;
  endReason: EndReason;
  durationMs: number;
  hero: { classId: HeroSnapshot['classId']; level: number; maxHp: number; hpLeft: number };
  enemy: { enemyId: string; level: number; isBoss: boolean; maxHp: number; hpLeft: number };
  build: (SkillId | null)[];
  stats: CombatStats;
  events: CombatEvent[];
}

export interface SimulateCombatOptions {
  /** `false` pour les simulations de masse (hors ligne, coach) : stats seulement. */
  recordEvents?: boolean;
  maxDurationMs?: number;
}

// ---------------------------------------------------------------------------
// État interne
// ---------------------------------------------------------------------------

interface TimedBuff {
  sourceId: SourceId;
  modifier: ModifierKey;
  value: number;
  expiresAt: number;
}

interface ActiveDot {
  sourceId: SourceId;
  school: School;
  perTick: number;
  ticksLeft: number;
  nextTickAt: number;
}

interface StatusEffect {
  value: number;
  expiresAt: number;
}

interface HeroState {
  hp: number;
  shield: number;
  shieldExpiresAt: number;
  buffs: TimedBuff[];
  dots: Map<DotId, ActiveDot>;
  nextAttackAt: number;
  gcdReadyAt: number;
  skillReadyAt: Map<SkillId, number>;
}

interface EnemyState {
  hp: number;
  statuses: Map<StatusId, StatusEffect>;
  dots: Map<DotId, ActiveDot>;
  nextAttackAt: number;
  abilityReadyAt: number[];
  enraged: number;
}

// ---------------------------------------------------------------------------
// Simulation
// ---------------------------------------------------------------------------

/**
 * Simule un combat héros contre ennemi, tick par tick (TICK_MS).
 * Pur et déterministe : mêmes entrées + même seed → même CombatLog.
 */
export function simulateCombat(
  hero: HeroSnapshot,
  enemy: EnemySnapshot,
  seed: string,
  options: SimulateCombatOptions = {},
): CombatLog {
  const record = options.recordEvents ?? true;
  const enemyDef = getEnemy(enemy.enemyId);
  const maxDuration =
    options.maxDurationMs ?? (enemyDef.isBoss ? MAX_BOSS_COMBAT_MS : MAX_COMBAT_MS);
  const rng = new Rng(seed);
  const classDef = CLASSES[hero.classId];

  const synergies = activeSynergies(hero.build);
  const baseMods = emptyModifiers();
  for (const syn of synergies) addModifiers(baseMods, syn.bonus);

  const skills: SkillDef[] = hero.build.slots
    .filter((id): id is SkillId => id !== null)
    .map((id) => getSkill(id));

  const events: CombatEvent[] = [];
  const stats: CombatStats = {
    damageBySource: {},
    dpsBySource: {},
    castsBySkill: Object.fromEntries(skills.map((s) => [s.id, 0])),
    totalDamageDealt: 0,
    damageTakenBySource: {},
    totalDamageTaken: 0,
    healingDone: 0,
    shieldAbsorbed: 0,
    idleTimeMs: 0,
    activeSynergies: synergies.map((s) => s.id),
  };

  const h: HeroState = {
    hp: hero.stats.maxHp,
    shield: 0,
    shieldExpiresAt: 0,
    buffs: [],
    dots: new Map(),
    nextAttackAt: 0,
    gcdReadyAt: 0,
    skillReadyAt: new Map(),
  };
  const e: EnemyState = {
    hp: enemy.stats.maxHp,
    statuses: new Map(),
    dots: new Map(),
    nextAttackAt: Math.round(enemy.stats.attackIntervalMs / 2),
    abilityReadyAt: enemyDef.abilities.map((a) =>
      a.kind === 'enrage' ? 0 : Math.round(a.cooldownMs / 2),
    ),
    enraged: 0,
  };

  const emit = (ev: CombatEvent) => {
    if (record) events.push(ev);
  };

  // ---- helpers dépendant de l'état -----------------------------------------

  const mods = (): Modifiers => {
    const m = { ...baseMods };
    for (const b of h.buffs) m[b.modifier] += b.value;
    return m;
  };

  const scalingValue = (scaling: Scaling, m: Modifiers): number => {
    switch (scaling) {
      case 'attack':
        return hero.stats.attack * (1 + m.attackPct);
      case 'spellPower':
        return hero.stats.spellPower * (1 + m.spellPowerPct);
      case 'maxHp':
        return hero.stats.maxHp;
    }
  };

  const rankMult = (skillId: SourceId): number => {
    const rank = hero.skillRanks[skillId] ?? 1;
    return 1 + SKILL_RANK_BONUS * (rank - 1);
  };

  const status = (s: StatusId, t: number): number => {
    const st = e.statuses.get(s);
    return st && st.expiresAt > t ? st.value : 0;
  };

  /** Multiplicateur offensif du héros (hors crit, hors mitigation). */
  const heroOffenseMult = (school: School, m: Modifiers, t: number): number => {
    let mult = 1 + m.damagePct;
    if (school === 'fire') {
      mult += m.firePct;
      if (status('chill', t) > 0) mult += m.fireVsChilledPct;
    }
    if (school === 'ice') mult += m.icePct;
    return mult;
  };

  const enemyMitigation = (school: School): number => {
    const flat =
      school === 'physical'
        ? MITIGATION_K / (MITIGATION_K + enemy.stats.armor)
        : MITIGATION_K / (MITIGATION_K + enemy.stats.resist);
    const pct = Math.min(MAX_RESIST_PCT, enemyDef.resistPct[school] ?? 0);
    return flat * (1 - pct);
  };

  const heroMitigation = (school: School, m: Modifiers): number => {
    const def = school === 'physical' ? hero.stats.armor * (1 + m.armorPct) : hero.stats.resist;
    return (MITIGATION_K / (MITIGATION_K + def)) * (1 + m.damageTakenPct);
  };

  const dealToEnemy = (
    t: number,
    sourceId: SourceId,
    school: School,
    raw: number,
    crit: boolean,
    dot: boolean,
  ) => {
    const amount = Math.max(
      1,
      Math.round(raw * enemyMitigation(school) * (1 + status('vulnerable', t))),
    );
    e.hp -= amount;
    stats.damageBySource[sourceId] = (stats.damageBySource[sourceId] ?? 0) + amount;
    stats.totalDamageDealt += amount;
    emit({ t, type: 'damage', actor: 'hero', sourceId, amount, absorbed: 0, crit, school, dot });
  };

  const dealToHero = (
    t: number,
    sourceId: SourceId,
    school: School,
    raw: number,
    crit: boolean,
    dot: boolean,
  ) => {
    const m = mods();
    let amount = Math.max(1, Math.round(raw * heroMitigation(school, m)));
    let absorbed = 0;
    if (h.shield > 0 && h.shieldExpiresAt > t) {
      absorbed = Math.min(h.shield, amount);
      h.shield -= absorbed;
      amount -= absorbed;
      stats.shieldAbsorbed += absorbed;
    }
    h.hp -= amount;
    stats.damageTakenBySource[sourceId] = (stats.damageTakenBySource[sourceId] ?? 0) + amount;
    stats.totalDamageTaken += amount;
    emit({ t, type: 'damage', actor: 'enemy', sourceId, amount, absorbed, crit, school, dot });
  };

  const healHero = (t: number, sourceId: SourceId, raw: number) => {
    const before = h.hp;
    h.hp = Math.min(hero.stats.maxHp, h.hp + Math.round(raw));
    const amount = h.hp - before;
    stats.healingDone += amount;
    emit({ t, type: 'heal', actor: 'hero', sourceId, amount });
  };

  // ---- actions du héros ----------------------------------------------------

  const canCast = (skill: SkillDef, t: number): boolean => {
    if ((h.skillReadyAt.get(skill.id) ?? 0) > t) return false;
    switch (skill.useWhen.kind) {
      case 'always':
        return true;
      case 'heroHpBelow':
        return h.hp < hero.stats.maxHp * skill.useWhen.pct;
      case 'buffNotActive':
        return !h.buffs.some((b) => b.sourceId === skill.id);
    }
  };

  const castSkill = (skill: SkillDef, t: number) => {
    const m = mods();
    const haste = 1 + m.hastePct;
    stats.castsBySkill[skill.id] = (stats.castsBySkill[skill.id] ?? 0) + 1;
    emit({ t, type: 'cast', actor: 'hero', sourceId: skill.id });
    const rank = rankMult(skill.id);

    for (const fx of skill.effects) {
      switch (fx.kind) {
        case 'damage': {
          const hits = fx.hits ?? 1;
          for (let i = 0; i < hits; i++) {
            let raw =
              scalingValue(fx.scaling, m) * fx.coef * rank * heroOffenseMult(fx.school, m, t);
            if (fx.executeBelowPct !== undefined && e.hp < enemy.stats.maxHp * fx.executeBelowPct) {
              raw *= fx.executeMult ?? 1;
            }
            if (fx.vsChilledMult !== undefined && status('chill', t) > 0) raw *= fx.vsChilledMult;
            const crit = rng.chance(hero.stats.critChance + m.critChance);
            if (crit) raw *= hero.stats.critMult;
            dealToEnemy(t, skill.id, fx.school, raw, crit, false);
            if (e.hp <= 0) return;
          }
          break;
        }
        case 'dot': {
          const perTick =
            scalingValue(fx.scaling, m) * fx.coefPerTick * rank * heroOffenseMult(fx.school, m, t);
          e.dots.set(fx.dot, {
            sourceId: skill.id,
            school: fx.school,
            perTick,
            ticksLeft: fx.ticks,
            nextTickAt: t + DOT_INTERVAL_MS,
          });
          break;
        }
        case 'heal':
          healHero(t, skill.id, scalingValue(fx.scaling, m) * fx.coef * rank * (1 + m.healingPct));
          break;
        case 'shield': {
          const amount = Math.round(
            scalingValue(fx.scaling, m) * fx.coef * rank * (1 + m.healingPct),
          );
          h.shield = amount;
          h.shieldExpiresAt = t + fx.durationMs;
          emit({ t, type: 'shield', actor: 'hero', sourceId: skill.id, amount });
          break;
        }
        case 'buff': {
          const durationMs = Math.round(fx.durationMs * (1 + m.buffDurationPct));
          h.buffs = h.buffs.filter((b) => !(b.sourceId === skill.id && b.modifier === fx.modifier));
          h.buffs.push({
            sourceId: skill.id,
            modifier: fx.modifier,
            value: fx.value,
            expiresAt: t + durationMs,
          });
          emit({
            t,
            type: 'buff',
            actor: 'hero',
            sourceId: skill.id,
            modifier: fx.modifier,
            value: fx.value,
            durationMs,
          });
          break;
        }
        case 'debuff': {
          e.statuses.set(fx.status, { value: fx.value, expiresAt: t + fx.durationMs });
          emit({
            t,
            type: 'status',
            actor: 'hero',
            sourceId: skill.id,
            status: fx.status,
            value: fx.value,
            durationMs: fx.durationMs,
          });
          break;
        }
      }
    }
    h.skillReadyAt.set(skill.id, t + Math.round(skill.cooldownMs / haste));
    h.gcdReadyAt = t + Math.round(GCD_MS / haste);
  };

  const heroBasicAttack = (t: number) => {
    const m = mods();
    const ba = classDef.basicAttack;
    let raw = scalingValue(ba.scaling, m) * ba.coef * heroOffenseMult(ba.school, m, t);
    const crit = rng.chance(hero.stats.critChance + m.critChance);
    if (crit) raw *= hero.stats.critMult;
    dealToEnemy(t, 'basic', ba.school, raw, crit, false);
    h.nextAttackAt = t + Math.round(hero.stats.attackIntervalMs / (1 + m.hastePct));
  };

  // ---- actions de l'ennemi -------------------------------------------------

  const enemyDamageMult = (t: number) => (1 + e.enraged) * (1 - status('weaken', t));

  const enemyUseAbility = (ability: EnemyAbility, index: number, t: number): boolean => {
    const sourceId = `ability:${index}`;
    switch (ability.kind) {
      case 'enrage':
        if (e.enraged === 0 && e.hp < enemy.stats.maxHp * ability.belowPct) {
          e.enraged = ability.damagePct;
          emit({
            t,
            type: 'buff',
            actor: 'enemy',
            sourceId,
            modifier: 'enrage',
            value: ability.damagePct,
            durationMs: 0,
          });
        }
        return false; // passif : ne consomme pas l'action
      case 'selfHeal': {
        if (e.hp >= enemy.stats.maxHp * ability.belowPct) return false;
        const before = e.hp;
        e.hp = Math.min(enemy.stats.maxHp, e.hp + Math.round(enemy.stats.maxHp * ability.pctMaxHp));
        emit({ t, type: 'cast', actor: 'enemy', sourceId });
        emit({ t, type: 'heal', actor: 'enemy', sourceId, amount: e.hp - before });
        return true;
      }
      case 'strike': {
        emit({ t, type: 'cast', actor: 'enemy', sourceId });
        let raw = enemy.stats.attack * ability.coef * enemyDamageMult(t);
        const crit = rng.chance(enemy.stats.critChance);
        if (crit) raw *= enemy.stats.critMult;
        dealToHero(t, sourceId, ability.school, raw, crit, false);
        return true;
      }
      case 'dot': {
        emit({ t, type: 'cast', actor: 'enemy', sourceId });
        h.dots.set(ability.dot, {
          sourceId,
          school: ability.school,
          perTick: enemy.stats.attack * ability.coefPerTick * enemyDamageMult(t),
          ticksLeft: ability.ticks,
          nextTickAt: t + DOT_INTERVAL_MS,
        });
        return true;
      }
    }
  };

  const enemyAct = (t: number, def: EnemyDef) => {
    if (status('stun', t) > 0) {
      if (e.nextAttackAt <= t) e.nextAttackAt = t + TICK_MS;
      return;
    }
    for (let i = 0; i < def.abilities.length; i++) {
      const ability = def.abilities[i] as EnemyAbility;
      if ((e.abilityReadyAt[i] ?? 0) > t) continue;
      if (enemyUseAbility(ability, i, t)) {
        if (ability.kind !== 'enrage') e.abilityReadyAt[i] = t + ability.cooldownMs;
        return;
      }
    }
    if (e.nextAttackAt <= t) {
      let raw = enemy.stats.attack * enemyDamageMult(t);
      const crit = rng.chance(enemy.stats.critChance);
      if (crit) raw *= enemy.stats.critMult;
      dealToHero(t, 'basic', def.school, raw, crit, false);
      const slow = 1 + status('chill', t);
      e.nextAttackAt = t + Math.round(enemy.stats.attackIntervalMs * slow);
    }
  };

  // ---- boucle --------------------------------------------------------------

  const tickDots = (t: number, target: Actor) => {
    const dots = target === 'enemy' ? e.dots : h.dots;
    for (const [id, dot] of dots) {
      if (dot.nextTickAt > t) continue;
      if (target === 'enemy') dealToEnemy(t, dot.sourceId, dot.school, dot.perTick, false, true);
      else dealToHero(t, dot.sourceId, dot.school, dot.perTick, false, true);
      dot.ticksLeft -= 1;
      dot.nextTickAt += DOT_INTERVAL_MS;
      if (dot.ticksLeft <= 0) dots.delete(id);
    }
  };

  let t = 0;
  let endReason: EndReason = 'timeout';
  for (; t <= maxDuration; t += TICK_MS) {
    h.buffs = h.buffs.filter((b) => b.expiresAt > t);
    if (h.shieldExpiresAt <= t) h.shield = 0;

    tickDots(t, 'enemy');
    if (e.hp <= 0) {
      endReason = 'enemyDefeated';
      break;
    }
    tickDots(t, 'hero');
    if (h.hp <= 0) {
      endReason = 'heroDefeated';
      break;
    }

    // Héros : une compétence si le GCD est prêt, puis l'attaque de base.
    if (h.gcdReadyAt <= t) {
      const skill = skills.find((s) => canCast(s, t));
      if (skill) castSkill(skill, t);
      else if (!skills.some((s) => (h.skillReadyAt.get(s.id) ?? 0) <= t)) {
        stats.idleTimeMs += TICK_MS;
      }
    }
    if (e.hp > 0 && h.nextAttackAt <= t) heroBasicAttack(t);
    if (e.hp <= 0) {
      endReason = 'enemyDefeated';
      break;
    }

    enemyAct(t, enemyDef);
    if (h.hp <= 0) {
      endReason = 'heroDefeated';
      break;
    }
  }

  const durationMs = Math.min(t, maxDuration);
  if (endReason === 'enemyDefeated') emit({ t: durationMs, type: 'death', actor: 'enemy' });
  if (endReason === 'heroDefeated') emit({ t: durationMs, type: 'death', actor: 'hero' });

  const seconds = Math.max(durationMs, TICK_MS) / 1000;
  for (const [src, dmg] of Object.entries(stats.damageBySource)) {
    stats.dpsBySource[src] = Math.round((dmg / seconds) * 10) / 10;
  }

  return {
    seed,
    outcome: endReason === 'enemyDefeated' ? 'win' : 'loss',
    endReason,
    durationMs,
    hero: {
      classId: hero.classId,
      level: hero.level,
      maxHp: hero.stats.maxHp,
      hpLeft: Math.max(0, h.hp),
    },
    enemy: {
      enemyId: enemy.enemyId,
      level: enemy.level,
      isBoss: enemyDef.isBoss,
      maxHp: enemy.stats.maxHp,
      hpLeft: Math.max(0, e.hp),
    },
    build: [...hero.build.slots],
    stats,
    events,
  };
}

/** Raccourci pratique pour les tests et outils : stats du héros déjà calculées. */
export function makeHero(
  classId: HeroSnapshot['classId'],
  level: number,
  stats: Stats,
  slots: (SkillId | null)[],
  skillRanks: Record<SkillId, number> = {},
): HeroSnapshot {
  return { classId, level, stats, build: { slots }, skillRanks };
}
