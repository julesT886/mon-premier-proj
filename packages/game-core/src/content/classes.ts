import type { ClassDef, ClassId } from '../types';

export const CLASSES: Readonly<Record<ClassId, ClassDef>> = {
  warrior: {
    id: 'warrior',
    name: { fr: 'Guerrier', en: 'Warrior' },
    base: {
      maxHp: 200,
      attack: 16,
      spellPower: 6,
      armor: 20,
      resist: 8,
      critChance: 0.08,
      critMult: 1.5,
      attackIntervalMs: 2000,
    },
    perLevel: { maxHp: 22, attack: 2.4, spellPower: 0.6, armor: 2.5, resist: 1.2 },
    basicAttack: { school: 'physical', scaling: 'attack', coef: 1.0 },
    starterSkills: ['w_heavy_strike', 'w_rend', 'w_war_cry'],
  },
  mage: {
    id: 'mage',
    name: { fr: 'Mage', en: 'Mage' },
    base: {
      maxHp: 150,
      attack: 6,
      spellPower: 18,
      armor: 8,
      resist: 16,
      critChance: 0.06,
      critMult: 1.5,
      attackIntervalMs: 2000,
    },
    perLevel: { maxHp: 16, attack: 0.6, spellPower: 2.8, armor: 1.3, resist: 2.2 },
    basicAttack: { school: 'arcane', scaling: 'spellPower', coef: 0.8 },
    starterSkills: ['m_fire_bolt', 'm_frost_shard', 'm_focus'],
  },
};
