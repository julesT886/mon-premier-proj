import type {
  CompanionDef,
  CompanionId,
  EnemyDef,
  EnemyId,
  RegionDef,
  RegionId,
  RelicDef,
  RelicId,
} from '../types';

// ---------------------------------------------------------------------------
// Brumeterre — un monde noyé de brume où les « Égarés » venus d'ailleurs
// se réveillent sans souvenirs, porteurs d'un don de Guerrier ou de Mage.
// ---------------------------------------------------------------------------

export const REGIONS: readonly RegionDef[] = [
  {
    id: 'forest',
    name: { fr: 'Bois-Murmure', en: 'Whisperwood' },
    mood: {
      fr: 'Une forêt d’arbres-lanternes où la mousse chuchote le nom des voyageurs.',
    },
    order: 1,
    minLevel: 1,
    maxLevel: 8,
    bossLevel: 8,
    enemies: ['moss_wolf', 'thorn_sylph', 'capgnome', 'bramble_ox'],
    boss: 'bramble_mother',
    bossKillThreshold: 25,
    resource: 'moonsap',
    unlockedBy: null,
    relics: ['lantern_seed', 'mossheart_charm'],
    companion: 'pip',
  },
  {
    id: 'volcano',
    name: { fr: 'Cœur-de-Braise', en: 'Emberheart' },
    mood: {
      fr: 'Un volcan endormi dont les coulées dessinent d’anciennes runes sur la roche noire.',
    },
    order: 2,
    minLevel: 9,
    maxLevel: 18,
    bossLevel: 18,
    enemies: ['ash_salamander', 'slag_golem', 'pyre_zealot', 'drakeling'],
    boss: 'vorhast',
    bossKillThreshold: 30,
    resource: 'embershard',
    unlockedBy: 'forest',
    relics: ['cinder_crown', 'obsidian_scale'],
    companion: 'brannoc',
  },
  {
    id: 'coast',
    name: { fr: 'Côte des Sel-Lunes', en: 'Saltmoon Coast' },
    mood: {
      fr: 'Des falaises d’écume où deux lunes tirent la marée dans des directions opposées.',
    },
    order: 3,
    minLevel: 19,
    maxLevel: 28,
    bossLevel: 28,
    enemies: ['nacre_crab', 'foam_siren', 'drowned_raider', 'young_kraken'],
    boss: 'thalassene',
    bossKillThreshold: 35,
    resource: 'nacre',
    unlockedBy: 'volcano',
    relics: ['tide_pearl', 'twin_moon_sigil'],
    companion: 'maelis',
  },
];

export const REGIONS_BY_ID: Readonly<Record<RegionId, RegionDef>> = Object.fromEntries(
  REGIONS.map((r) => [r.id, r]),
) as Record<RegionId, RegionDef>;

export const ENEMIES: readonly EnemyDef[] = [
  // ----------------------------------------------------------- Bois-Murmure
  {
    id: 'moss_wolf',
    name: { fr: 'Loup-de-mousse', en: 'Moss Wolf' },
    region: 'forest',
    isBoss: false,
    hpMult: 0.9,
    attackMult: 1.0,
    armorMult: 0.8,
    attackIntervalMs: 1800,
    school: 'physical',
    resistPct: { fire: -0.2 },
    abilities: [],
  },
  {
    id: 'thorn_sylph',
    name: { fr: 'Sylphe épineuse', en: 'Thorn Sylph' },
    region: 'forest',
    isBoss: false,
    hpMult: 0.75,
    attackMult: 0.9,
    armorMult: 0.6,
    attackIntervalMs: 2200,
    school: 'arcane',
    resistPct: { fire: -0.2, arcane: 0.2 },
    abilities: [
      {
        kind: 'dot',
        name: { fr: 'Épines venimeuses' },
        dot: 'bleed',
        school: 'physical',
        coefPerTick: 0.25,
        ticks: 4,
        cooldownMs: 9000,
      },
    ],
  },
  {
    id: 'capgnome',
    name: { fr: 'Champignard', en: 'Capgnome' },
    region: 'forest',
    isBoss: false,
    hpMult: 1.1,
    attackMult: 0.8,
    armorMult: 1.0,
    attackIntervalMs: 2400,
    school: 'physical',
    resistPct: { fire: -0.25, ice: 0.1 },
    abilities: [
      {
        kind: 'selfHeal',
        name: { fr: 'Spores régénérantes' },
        pctMaxHp: 0.15,
        cooldownMs: 12000,
        belowPct: 0.5,
      },
    ],
  },
  {
    id: 'bramble_ox',
    name: { fr: 'Ronceboeuf', en: 'Bramble Ox' },
    region: 'forest',
    isBoss: false,
    hpMult: 1.4,
    attackMult: 1.15,
    armorMult: 1.3,
    attackIntervalMs: 2800,
    school: 'physical',
    resistPct: { fire: -0.15 },
    abilities: [
      { kind: 'strike', name: { fr: 'Ruée' }, school: 'physical', coef: 1.8, cooldownMs: 10000 },
    ],
  },
  {
    id: 'bramble_mother',
    name: { fr: 'La Mère-Ronce', en: 'The Bramble Mother' },
    region: 'forest',
    isBoss: true,
    hpMult: 3.0,
    attackMult: 0.85,
    armorMult: 1.2,
    attackIntervalMs: 2200,
    school: 'physical',
    resistPct: { fire: -0.2, ice: 0.1 },
    abilities: [
      {
        kind: 'dot',
        name: { fr: 'Étreinte de ronces' },
        dot: 'bleed',
        school: 'physical',
        coefPerTick: 0.3,
        ticks: 5,
        cooldownMs: 12000,
      },
      {
        kind: 'selfHeal',
        name: { fr: 'Sève ancienne' },
        pctMaxHp: 0.1,
        cooldownMs: 20000,
        belowPct: 0.5,
      },
      { kind: 'enrage', name: { fr: 'Colère de la forêt' }, belowPct: 0.3, damagePct: 0.3 },
    ],
  },

  // ---------------------------------------------------------- Cœur-de-Braise
  {
    id: 'ash_salamander',
    name: { fr: 'Salamandre de cendre', en: 'Ash Salamander' },
    region: 'volcano',
    isBoss: false,
    hpMult: 0.9,
    attackMult: 1.0,
    armorMult: 0.8,
    attackIntervalMs: 1900,
    school: 'fire',
    resistPct: { fire: 0.5, ice: -0.25 },
    abilities: [
      {
        kind: 'dot',
        name: { fr: 'Souffle cendreux' },
        dot: 'burn',
        school: 'fire',
        coefPerTick: 0.3,
        ticks: 3,
        cooldownMs: 8000,
      },
    ],
  },
  {
    id: 'slag_golem',
    name: { fr: 'Golem de scories', en: 'Slag Golem' },
    region: 'volcano',
    isBoss: false,
    hpMult: 1.5,
    attackMult: 1.1,
    armorMult: 1.8,
    attackIntervalMs: 3000,
    school: 'physical',
    resistPct: { fire: 0.4, ice: -0.2, arcane: -0.1 },
    abilities: [
      {
        kind: 'strike',
        name: { fr: 'Poing de magma' },
        school: 'fire',
        coef: 1.6,
        cooldownMs: 11000,
      },
    ],
  },
  {
    id: 'pyre_zealot',
    name: { fr: 'Fervent du bûcher', en: 'Pyre Zealot' },
    region: 'volcano',
    isBoss: false,
    hpMult: 0.8,
    attackMult: 1.2,
    armorMult: 0.7,
    attackIntervalMs: 2200,
    school: 'fire',
    resistPct: { fire: 0.5, ice: -0.2 },
    abilities: [{ kind: 'enrage', name: { fr: 'Extase ardente' }, belowPct: 0.4, damagePct: 0.35 }],
  },
  {
    id: 'drakeling',
    name: { fr: 'Drakelet', en: 'Drakeling' },
    region: 'volcano',
    isBoss: false,
    hpMult: 1.1,
    attackMult: 1.1,
    armorMult: 1.1,
    attackIntervalMs: 2000,
    school: 'fire',
    resistPct: { fire: 0.45, ice: -0.25 },
    abilities: [
      {
        kind: 'strike',
        name: { fr: 'Crachat de flammes' },
        school: 'fire',
        coef: 1.5,
        cooldownMs: 9000,
      },
    ],
  },
  {
    id: 'vorhast',
    name: { fr: 'Vorhast, Tyran des Cendres', en: 'Vorhast, Ash Tyrant' },
    region: 'volcano',
    isBoss: true,
    hpMult: 3.2,
    attackMult: 0.9,
    armorMult: 1.4,
    attackIntervalMs: 2300,
    school: 'fire',
    resistPct: { fire: 0.6, ice: -0.25 },
    abilities: [
      { kind: 'strike', name: { fr: 'Éruption' }, school: 'fire', coef: 2.2, cooldownMs: 12000 },
      {
        kind: 'dot',
        name: { fr: 'Pluie de cendres' },
        dot: 'burn',
        school: 'fire',
        coefPerTick: 0.35,
        ticks: 5,
        cooldownMs: 15000,
      },
      { kind: 'enrage', name: { fr: 'Cœur en fusion' }, belowPct: 0.3, damagePct: 0.35 },
    ],
  },

  // ------------------------------------------------------ Côte des Sel-Lunes
  {
    id: 'nacre_crab',
    name: { fr: 'Crabe-nacre', en: 'Nacre Crab' },
    region: 'coast',
    isBoss: false,
    hpMult: 1.2,
    attackMult: 0.9,
    armorMult: 2.0,
    attackIntervalMs: 2400,
    school: 'physical',
    resistPct: { ice: 0.3, arcane: -0.2 },
    abilities: [],
  },
  {
    id: 'foam_siren',
    name: { fr: 'Sirène d’écume', en: 'Foam Siren' },
    region: 'coast',
    isBoss: false,
    hpMult: 0.8,
    attackMult: 1.15,
    armorMult: 0.6,
    attackIntervalMs: 2200,
    school: 'arcane',
    resistPct: { ice: 0.4, fire: -0.1 },
    abilities: [
      {
        kind: 'selfHeal',
        name: { fr: 'Chant des marées' },
        pctMaxHp: 0.15,
        cooldownMs: 12000,
        belowPct: 0.5,
      },
    ],
  },
  {
    id: 'drowned_raider',
    name: { fr: 'Pilleur noyé', en: 'Drowned Raider' },
    region: 'coast',
    isBoss: false,
    hpMult: 1.0,
    attackMult: 1.2,
    armorMult: 1.1,
    attackIntervalMs: 2000,
    school: 'physical',
    resistPct: { ice: 0.3, fire: -0.15 },
    abilities: [
      {
        kind: 'dot',
        name: { fr: 'Lame rouillée' },
        dot: 'bleed',
        school: 'physical',
        coefPerTick: 0.3,
        ticks: 4,
        cooldownMs: 9000,
      },
    ],
  },
  {
    id: 'young_kraken',
    name: { fr: 'Kraken juvénile', en: 'Young Kraken' },
    region: 'coast',
    isBoss: false,
    hpMult: 1.4,
    attackMult: 1.1,
    armorMult: 1.0,
    attackIntervalMs: 2600,
    school: 'ice',
    resistPct: { ice: 0.5, fire: -0.2 },
    abilities: [
      {
        kind: 'strike',
        name: { fr: 'Tentacule glacé' },
        school: 'ice',
        coef: 1.7,
        cooldownMs: 10000,
      },
    ],
  },
  {
    id: 'thalassene',
    name: { fr: 'Thalassène, la Marée sans fond', en: 'Thalassene, the Bottomless Tide' },
    region: 'coast',
    isBoss: true,
    hpMult: 4.2,
    attackMult: 0.95,
    armorMult: 1.3,
    attackIntervalMs: 2200,
    school: 'ice',
    resistPct: { ice: 0.55, fire: 0.1 },
    abilities: [
      { kind: 'strike', name: { fr: 'Raz-de-marée' }, school: 'ice', coef: 2.3, cooldownMs: 13000 },
      {
        kind: 'selfHeal',
        name: { fr: 'Reflux' },
        pctMaxHp: 0.08,
        cooldownMs: 18000,
        belowPct: 0.6,
      },
      { kind: 'enrage', name: { fr: 'Marée d’équinoxe' }, belowPct: 0.25, damagePct: 0.4 },
    ],
  },
];

export const ENEMIES_BY_ID: Readonly<Record<EnemyId, EnemyDef>> = Object.fromEntries(
  ENEMIES.map((e) => [e.id, e]),
);

export function getEnemy(id: EnemyId): EnemyDef {
  const enemy = ENEMIES_BY_ID[id];
  if (!enemy) throw new Error(`Unknown enemy: ${id}`);
  return enemy;
}

export const RELICS: readonly RelicDef[] = [
  {
    id: 'lantern_seed',
    name: { fr: 'Graine-lanterne', en: 'Lantern Seed' },
    description: { fr: '+40 PV max.' },
    bonus: { maxHp: 40 },
  },
  {
    id: 'mossheart_charm',
    name: { fr: 'Charme cœur-de-mousse', en: 'Mossheart Charm' },
    description: { fr: '+4 attaque, +4 puissance des sorts.' },
    bonus: { attack: 4, spellPower: 4 },
  },
  {
    id: 'cinder_crown',
    name: { fr: 'Couronne de cendre', en: 'Cinder Crown' },
    description: { fr: '+5 % de chance de critique.' },
    bonus: { critChance: 0.05 },
  },
  {
    id: 'obsidian_scale',
    name: { fr: 'Écaille d’obsidienne', en: 'Obsidian Scale' },
    description: { fr: '+20 armure, +10 résistance.' },
    bonus: { armor: 20, resist: 10 },
  },
  {
    id: 'tide_pearl',
    name: { fr: 'Perle des marées', en: 'Tide Pearl' },
    description: { fr: '+120 PV max.' },
    bonus: { maxHp: 120 },
  },
  {
    id: 'twin_moon_sigil',
    name: { fr: 'Sceau des lunes jumelles', en: 'Twin-Moon Sigil' },
    description: { fr: '+10 attaque, +10 puissance des sorts.' },
    bonus: { attack: 10, spellPower: 10 },
  },
];

export const RELICS_BY_ID: Readonly<Record<RelicId, RelicDef>> = Object.fromEntries(
  RELICS.map((r) => [r.id, r]),
);

export const COMPANIONS: readonly CompanionDef[] = [
  {
    id: 'pip',
    name: { fr: 'Pip', en: 'Pip' },
    description: { fr: 'Un feu follet bavard qui prétend connaître tous les sentiers.' },
    region: 'forest',
  },
  {
    id: 'brannoc',
    name: { fr: 'Brannoc', en: 'Brannoc' },
    description: { fr: 'Un forgeron nain bourru, exilé du volcan, qui note tout dans un carnet.' },
    region: 'volcano',
  },
  {
    id: 'maelis',
    name: { fr: 'Maëlis', en: 'Maelis' },
    description: { fr: 'Une cartographe des marées qui parle aux deux lunes.' },
    region: 'coast',
  },
];

export const COMPANIONS_BY_ID: Readonly<Record<CompanionId, CompanionDef>> = Object.fromEntries(
  COMPANIONS.map((c) => [c.id, c]),
);
