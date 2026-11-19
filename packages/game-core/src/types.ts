// ---------------------------------------------------------------------------
// Types du domaine. Les identifiants sont en anglais (code), les libellés
// joueurs sont localisés via `Localized`.
// ---------------------------------------------------------------------------

export type Locale = 'fr' | 'en';
/** Texte localisé : le français est obligatoire, les autres langues optionnelles. */
export type Localized = { fr: string } & Partial<Record<Exclude<Locale, 'fr'>, string>>;

export type ClassId = 'warrior' | 'mage';
export type Tag = 'fire' | 'ice' | 'melee' | 'buff' | 'burst' | 'support';
export const ALL_TAGS: readonly Tag[] = ['fire', 'ice', 'melee', 'buff', 'burst', 'support'];

export type School = 'physical' | 'fire' | 'ice' | 'arcane';
export type Scaling = 'attack' | 'spellPower' | 'maxHp';

export type SkillId = string;
export type RegionId = 'forest' | 'volcano' | 'coast';
export type EnemyId = string;
export type RelicId = string;
export type SynergyId = string;
export type ResourceId = 'gold' | 'moonsap' | 'embershard' | 'nacre';

// ---------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------

export interface Stats {
  maxHp: number;
  attack: number;
  spellPower: number;
  armor: number;
  /** Résistance magique plate (réduit feu/glace/arcane). */
  resist: number;
  /** Chance de critique dans [0, 1]. */
  critChance: number;
  /** Multiplicateur de critique (ex. 1.5). */
  critMult: number;
  /** Intervalle de l'attaque de base, en ms. */
  attackIntervalMs: number;
}

/** Bonus additifs en pourcentage (0.2 = +20 %), issus des synergies et buffs. */
export interface Modifiers {
  attackPct: number;
  spellPowerPct: number;
  hastePct: number;
  critChance: number;
  armorPct: number;
  damagePct: number;
  firePct: number;
  icePct: number;
  healingPct: number;
  buffDurationPct: number;
  fireVsChilledPct: number;
  damageTakenPct: number;
}

export type ModifierKey = keyof Modifiers;

// ---------------------------------------------------------------------------
// Compétences
// ---------------------------------------------------------------------------

export type StatusId = 'chill' | 'vulnerable' | 'weaken' | 'stun';
export type DotId = 'burn' | 'bleed' | 'frostbite';

export type SkillEffect =
  | {
      kind: 'damage';
      school: School;
      scaling: Scaling;
      coef: number;
      hits?: number;
      /** Bonus si la cible est sous ce % de PV (exécution). */
      executeBelowPct?: number;
      executeMult?: number;
      /** Multiplicateur si la cible est ralentie (chill). */
      vsChilledMult?: number;
    }
  | {
      kind: 'dot';
      dot: DotId;
      school: School;
      scaling: Scaling;
      coefPerTick: number;
      ticks: number;
    }
  | { kind: 'heal'; scaling: Scaling; coef: number }
  | { kind: 'shield'; scaling: Scaling; coef: number; durationMs: number }
  | { kind: 'buff'; modifier: ModifierKey; value: number; durationMs: number }
  | { kind: 'debuff'; status: StatusId; value: number; durationMs: number };

export type UseCondition =
  | { kind: 'always' }
  /** Lancer seulement si les PV du héros sont sous ce seuil (0-1). */
  | { kind: 'heroHpBelow'; pct: number }
  /** Lancer seulement si les buffs de cette compétence ne sont plus actifs. */
  | { kind: 'buffNotActive' };

export interface SkillDef {
  id: SkillId;
  classId: ClassId;
  name: Localized;
  description: Localized;
  tags: readonly Tag[];
  requiredLevel: number;
  cooldownMs: number;
  effects: readonly SkillEffect[];
  useWhen: UseCondition;
}

export interface SynergyRequirement {
  /** Nombre de compétences du build portant au moins un de ces tags. */
  anyOf: readonly Tag[];
  count: number;
}

export interface SynergyDef {
  id: SynergyId;
  name: Localized;
  description: Localized;
  requires: readonly SynergyRequirement[];
  bonus: Partial<Modifiers>;
}

// ---------------------------------------------------------------------------
// Classes, ennemis, monde
// ---------------------------------------------------------------------------

export interface ClassDef {
  id: ClassId;
  name: Localized;
  base: Stats;
  perLevel: Pick<Stats, 'maxHp' | 'attack' | 'spellPower' | 'armor' | 'resist'>;
  basicAttack: { school: School; scaling: Scaling; coef: number };
  starterSkills: readonly SkillId[];
}

export type EnemyAbility =
  | { kind: 'strike'; name: Localized; school: School; coef: number; cooldownMs: number }
  | {
      kind: 'dot';
      name: Localized;
      dot: DotId;
      school: School;
      coefPerTick: number;
      ticks: number;
      cooldownMs: number;
    }
  | { kind: 'selfHeal'; name: Localized; pctMaxHp: number; cooldownMs: number; belowPct: number }
  | { kind: 'enrage'; name: Localized; belowPct: number; damagePct: number };

export interface EnemyDef {
  id: EnemyId;
  name: Localized;
  region: RegionId;
  isBoss: boolean;
  hpMult: number;
  attackMult: number;
  armorMult: number;
  attackIntervalMs: number;
  school: School;
  /** Résistance en % par école (négatif = faiblesse). */
  resistPct: Partial<Record<School, number>>;
  abilities: readonly EnemyAbility[];
}

export interface RegionDef {
  id: RegionId;
  name: Localized;
  mood: Localized;
  order: number;
  minLevel: number;
  maxLevel: number;
  bossLevel: number;
  enemies: readonly EnemyId[];
  boss: EnemyId;
  /** Victoires nécessaires dans la région avant une tentative sur le boss. */
  bossKillThreshold: number;
  resource: Exclude<ResourceId, 'gold'>;
  /** Région à vaincre (boss) pour débloquer celle-ci. */
  unlockedBy: RegionId | null;
  relics: readonly RelicId[];
  companion: CompanionId;
}

export type CompanionId = string;

export interface CompanionDef {
  id: CompanionId;
  name: Localized;
  description: Localized;
  region: RegionId;
}

export interface RelicDef {
  id: RelicId;
  name: Localized;
  description: Localized;
  bonus: Partial<
    Pick<Stats, 'maxHp' | 'attack' | 'spellPower' | 'armor' | 'resist' | 'critChance'>
  >;
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------

export const BUILD_SLOTS = 4;
/** Les slots sont aussi l'ordre de priorité de lancement (slot 0 = priorité max). */
export interface Build {
  slots: readonly (SkillId | null)[];
}

// ---------------------------------------------------------------------------
// Combattants
// ---------------------------------------------------------------------------

export interface HeroSnapshot {
  classId: ClassId;
  level: number;
  stats: Stats;
  build: Build;
  skillRanks: Readonly<Record<SkillId, number>>;
}

export interface EnemySnapshot {
  enemyId: EnemyId;
  level: number;
  stats: Stats;
}
