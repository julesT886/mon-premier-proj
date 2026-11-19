import type { SynergyDef } from '../types';

/**
 * Synergies de build : actives quand les 4 slots contiennent assez de compétences
 * portant les tags requis. Une compétence à plusieurs tags compte pour chacun.
 */
export const SYNERGIES: readonly SynergyDef[] = [
  {
    id: 'blaze',
    name: { fr: 'Brasier', en: 'Blaze' },
    description: { fr: '2 compétences de feu : +20 % de dégâts de feu.' },
    requires: [{ anyOf: ['fire'], count: 2 }],
    bonus: { firePct: 0.2 },
  },
  {
    id: 'deep_frost',
    name: { fr: 'Givre profond', en: 'Deep Frost' },
    description: { fr: '2 compétences de glace : +20 % de dégâts de glace.' },
    requires: [{ anyOf: ['ice'], count: 2 }],
    bonus: { icePct: 0.2 },
  },
  {
    id: 'thermal_shock',
    name: { fr: 'Choc thermique', en: 'Thermal Shock' },
    description: { fr: '1 feu + 1 glace : le feu inflige +30 % aux cibles ralenties.' },
    requires: [
      { anyOf: ['fire'], count: 1 },
      { anyOf: ['ice'], count: 1 },
    ],
    bonus: { fireVsChilledPct: 0.3 },
  },
  {
    id: 'martial_fury',
    name: { fr: 'Fureur martiale', en: 'Martial Fury' },
    description: { fr: '3 compétences de mêlée : +15 % de hâte.' },
    requires: [{ anyOf: ['melee'], count: 3 }],
    bonus: { hastePct: 0.15 },
  },
  {
    id: 'bulwark',
    name: { fr: 'Rempart', en: 'Bulwark' },
    description: { fr: '2 compétences de soutien : soins et boucliers +25 %.' },
    requires: [{ anyOf: ['support'], count: 2 }],
    bonus: { healingPct: 0.25 },
  },
  {
    id: 'exaltation',
    name: { fr: 'Exaltation', en: 'Exaltation' },
    description: { fr: '2 compétences de buff : durée des buffs +30 %.' },
    requires: [{ anyOf: ['buff'], count: 2 }],
    bonus: { buffDurationPct: 0.3 },
  },
  {
    id: 'killing_blow',
    name: { fr: 'Coup de grâce', en: 'Killing Blow' },
    description: { fr: '2 compétences burst : +10 % de chance de critique.' },
    requires: [{ anyOf: ['burst'], count: 2 }],
    bonus: { critChance: 0.1 },
  },
  {
    id: 'spellblade',
    name: { fr: 'Lame-sort', en: 'Spellblade' },
    description: { fr: '1 mêlée + 1 élémentaire : +10 % de dégâts.' },
    requires: [
      { anyOf: ['melee'], count: 1 },
      { anyOf: ['fire', 'ice'], count: 1 },
    ],
    bonus: { damagePct: 0.1 },
  },
];
