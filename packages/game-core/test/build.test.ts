import { describe, expect, it } from 'vitest';
import {
  availableSkills,
  countTags,
  DUAL_CLASS_LEVEL,
  evaluateSynergies,
  isBuildValid,
  setSlot,
  starterBuild,
  swapSlots,
  synergyModifiers,
  validateBuild,
} from '../src/index';

describe('build validation', () => {
  it('accepts the warrior starter build', () => {
    const build = starterBuild(['w_heavy_strike', 'w_rend', 'w_war_cry']);
    expect(build.slots).toEqual(['w_heavy_strike', 'w_rend', 'w_war_cry', null]);
    expect(isBuildValid(build, 'warrior', 1)).toBe(true);
  });

  it('reports unknown, duplicate, locked and empty builds', () => {
    expect(validateBuild({ slots: ['x', null, null, null] }, 'warrior', 1)).toContainEqual({
      code: 'unknown_skill',
      skillId: 'x',
    });
    expect(validateBuild({ slots: ['w_rend', 'w_rend', null, null] }, 'warrior', 1)).toContainEqual(
      { code: 'duplicate_skill', skillId: 'w_rend' },
    );
    expect(validateBuild({ slots: ['w_charge', null, null, null] }, 'warrior', 1)).toContainEqual({
      code: 'locked_skill',
      skillId: 'w_charge',
    });
    expect(validateBuild({ slots: [null, null, null, null] }, 'warrior', 1)).toContainEqual({
      code: 'empty_build',
    });
    expect(validateBuild({ slots: ['w_rend'] }, 'warrior', 1)).toContainEqual({
      code: 'wrong_slot_count',
      expected: 4,
      actual: 1,
    });
  });

  it('gates off-class skills behind the dual-class level', () => {
    const build = { slots: ['w_rend', 'm_fire_bolt', null, null] };
    expect(isBuildValid(build, 'warrior', DUAL_CLASS_LEVEL - 1)).toBe(false);
    expect(isBuildValid(build, 'warrior', DUAL_CLASS_LEVEL)).toBe(true);
    expect(availableSkills('warrior', 1).every((s) => s.classId === 'warrior')).toBe(true);
    expect(availableSkills('warrior', DUAL_CLASS_LEVEL).some((s) => s.classId === 'mage')).toBe(
      true,
    );
  });

  it('setSlot moves a skill instead of duplicating it, swapSlots reorders', () => {
    const b = starterBuild(['w_heavy_strike', 'w_rend', 'w_war_cry']);
    expect(setSlot(b, 3, 'w_rend').slots).toEqual(['w_heavy_strike', null, 'w_war_cry', 'w_rend']);
    expect(setSlot(b, 0, null).slots[0]).toBeNull();
    expect(swapSlots(b, 0, 2).slots).toEqual(['w_war_cry', 'w_rend', 'w_heavy_strike', null]);
  });
});

describe('synergies', () => {
  it('counts tags across the build', () => {
    const counts = countTags({ slots: ['m_cataclysm', 'm_fire_bolt', null, 'x'] });
    expect(counts.fire).toBe(2);
    expect(counts.ice).toBe(1);
    expect(counts.burst).toBe(1);
  });

  it('activates blaze, thermal shock and reports missing counts', () => {
    const statuses = evaluateSynergies({
      slots: ['m_fire_bolt', 'm_combustion', 'm_frost_shard', 'm_focus'],
    });
    const byId = Object.fromEntries(statuses.map((s) => [s.id, s]));
    expect(byId.blaze?.active).toBe(true);
    expect(byId.thermal_shock?.active).toBe(true);
    expect(byId.deep_frost).toEqual({ id: 'deep_frost', active: false, missing: 1 });
    expect(byId.martial_fury?.missing).toBe(3);
  });

  it('aggregates synergy modifiers', () => {
    const mods = synergyModifiers({
      slots: ['m_fire_bolt', 'm_combustion', 'm_frost_shard', 'm_focus'],
    });
    expect(mods.firePct).toBeCloseTo(0.2);
    expect(mods.fireVsChilledPct).toBeCloseTo(0.3);
    expect(mods.icePct).toBe(0);
  });
});
