import { describe, expect, it } from 'vitest';
import {
  applySuggestion,
  compareBuilds,
  createNewGame,
  diagnose,
  evaluateBuild,
  findBestSwaps,
  formatImpact,
  heroSnapshot,
  localCoach,
  makeEnemy,
  simulateCombat,
  summarizeCombatLog,
  verifySuggestions,
  type GameState,
} from '../src/index';

/** Mage niveau 20 sur la côte avec un build glace (la côte résiste à la glace). */
function iceMageOnCoast(): GameState {
  const s = createNewGame({ heroName: 'Lune', classId: 'mage', playerSeed: 'coach' });
  s.hero.level = 26;
  s.activeRegion = 'coast';
  s.regions.volcano.unlocked = true;
  s.regions.coast.unlocked = true;
  s.relics = ['lantern_seed', 'mossheart_charm', 'cinder_crown', 'obsidian_scale'];
  s.build = { slots: ['m_focus', 'm_frost_shard', 'm_ice_lance', 'm_frost_nova'] };
  return s;
}

describe('evaluateBuild / compareBuilds', () => {
  it('is deterministic and uses common seeds', () => {
    const s = iceMageOnCoast();
    const a = evaluateBuild(s, s.build, { kind: 'boss', region: 'coast' });
    const b = evaluateBuild(s, s.build, { kind: 'boss', region: 'coast' });
    expect(a).toEqual(b);
    expect(a.runs).toBe(20);
  });

  it('supports region and single-enemy targets', () => {
    const s = iceMageOnCoast();
    const region = evaluateBuild(s, s.build, { kind: 'region', region: 'coast' }, 4);
    const enemy = evaluateBuild(s, s.build, { kind: 'enemy', enemyId: 'nacre_crab', level: 20 }, 4);
    expect(region.winRate).toBeGreaterThan(0);
    expect(enemy.avgDps).toBeGreaterThan(0);
  });

  it('measures a real improvement for a fire build against the coast boss', () => {
    const s = iceMageOnCoast();
    const fire = { slots: ['m_focus', 'm_ember_rain', 'm_living_flame', 'm_fire_bolt'] };
    const cmp = compareBuilds(s, s.build, fire, { kind: 'boss', region: 'coast' });
    expect(cmp.valid).toBe(true);
    expect(cmp.after.avgDps).toBeGreaterThan(cmp.before.avgDps);
    expect(cmp.improved).toBe(true);
  });

  it('flags an invalid proposal without simulating it', () => {
    const s = iceMageOnCoast();
    s.hero.level = 3;
    const cmp = compareBuilds(
      s,
      s.build,
      { slots: ['m_cataclysm', null, null, null] },
      {
        kind: 'boss',
        region: 'forest',
      },
    );
    expect(cmp.valid).toBe(false);
    expect(cmp.improved).toBe(false);
    expect(cmp.winRateDelta).toBe(0);
  });
});

describe('summarizeCombatLog', () => {
  const s = iceMageOnCoast();
  const log = simulateCombat(heroSnapshot(s), makeEnemy('thalassene', 28), 'sum');
  const summary = summarizeCombatLog(log);

  it('aggregates without raw events and stays bounded', () => {
    expect(JSON.stringify(summary).length).toBeLessThan(4000);
    expect(summary.topDamage.length).toBeLessThanOrEqual(3);
    expect(summary.deathCauses.length).toBeLessThanOrEqual(3);
    expect(summary.slots).toHaveLength(4);
    expect(summary.enemy.name).toBe('Thalassène, la Marée sans fond');
    expect(summary.enemy.resistances.ice).toBeGreaterThan(0.3);
  });

  it('names sources in French and computes shares', () => {
    const totalShare = summary.topDamage.reduce((n, d) => n + d.sharePct, 0);
    expect(totalShare).toBeLessThanOrEqual(100.1);
    expect(summary.deathCauses.every((d) => d.name.length > 0)).toBe(true);
  });

  it('diagnose() speaks English when asked', () => {
    const en = summarizeCombatLog(log, 'en');
    const problems = diagnose(en, 'en');
    const resisted = problems.find((p) => p.type === 'resisted_school');
    expect(resisted?.detail).toMatch(/resists ice damage by \d+%/);
  });

  it('diagnose() spots the resisted school', () => {
    const problems = diagnose(summary);
    expect(problems.map((p) => p.type)).toContain('resisted_school');
  });
});

describe('underleveled losses (warrior level 5 vs Vorhast level 18)', () => {
  function lowWarrior(): GameState {
    const s = createNewGame({ heroName: 'Jule', classId: 'warrior', playerSeed: 'jule' });
    s.hero.level = 5;
    s.activeRegion = 'volcano';
    s.regions.volcano.unlocked = true;
    s.build = { slots: ['w_iron_skin', 'w_rend', 'w_war_cry', 'w_whirlwind'] };
    return s;
  }
  const target = { kind: 'boss' as const, region: 'volcano' as const };

  it('blames the level gap first, in the explanation too', () => {
    const s = lowWarrior();
    const log = simulateCombat(heroSnapshot(s), makeEnemy('vorhast', 18), 'jule', {
      recordEvents: false,
    });
    const summary = summarizeCombatLog(log);
    expect(diagnose(summary)[0]?.type).toBe('underleveled');
    const { advice } = localCoach(s, summary, target);
    expect(advice.explanation).toContain('niveau 18');
    expect(advice.explanation).toContain('niveau 5');
    expect(advice.problems.some((p) => p.type === 'underleveled')).toBe(false);
    const en = localCoach(s, summarizeCombatLog(log, 'en'), target, 'en');
    expect(en.advice.explanation).toContain('level 18');
  });

  it('when every fight is lost, progress means a more damaged boss, not a faster death', () => {
    const s = lowWarrior();
    const weaker = { slots: ['w_iron_skin', null, 'w_war_cry', 'w_whirlwind'] };
    const worse = compareBuilds(s, s.build, weaker, target);
    expect(worse.before.winRate).toBe(0);
    expect(worse.after.winRate).toBe(0);
    expect(worse.enemyHpDelta).toBeGreaterThan(0);
    expect(worse.improved).toBe(false);

    const better = compareBuilds(s, weaker, s.build, target);
    expect(better.enemyHpDelta).toBeLessThan(-0.02);
    expect(better.improved).toBe(true);
    expect(formatImpact(better)).toMatch(/ennemi à \d+ % de PV \(au lieu de \d+ %\)/);
  });
});

describe('coach helpers', () => {
  it('verifySuggestions drops out-of-range slots and unknown skills', () => {
    const s = iceMageOnCoast();
    const verified = verifySuggestions(
      s,
      [
        { changeSlot: 9, from: null, to: 'm_fire_bolt', expectedImpact: '' },
        { changeSlot: 1, from: 'm_frost_shard', to: 'nope', expectedImpact: '' },
        { changeSlot: 1, from: 'm_frost_shard', to: 'm_ember_rain', expectedImpact: '' },
      ],
      { kind: 'boss', region: 'coast' },
      6,
    );
    expect(verified).toHaveLength(1);
    expect(verified[0]!.build.slots[1]).toBe('m_ember_rain');
  });

  it('applySuggestion swaps a single slot', () => {
    const b = applySuggestion({ slots: ['a', 'b', 'c', 'd'] }, { changeSlot: 2, to: 'x' });
    expect(b.slots).toEqual(['a', 'b', 'x', 'd']);
  });

  it('findBestSwaps only returns measured improvements, one per slot and per skill', () => {
    const s = iceMageOnCoast();
    const swaps = findBestSwaps(s, { kind: 'boss', region: 'coast' }, { max: 2, runs: 10 });
    expect(swaps.length).toBeGreaterThan(0);
    for (const v of swaps) expect(v.comparison.improved).toBe(true);
    expect(new Set(swaps.map((v) => v.suggestion.changeSlot)).size).toBe(swaps.length);
    expect(new Set(swaps.map((v) => v.suggestion.to)).size).toBe(swaps.length);
  });

  it('localCoach produces a complete advice offline', () => {
    const s = iceMageOnCoast();
    const log = simulateCombat(heroSnapshot(s), makeEnemy('thalassene', 28), 'lc', {
      recordEvents: false,
    });
    const { advice, verified } = localCoach(s, summarizeCombatLog(log), {
      kind: 'boss',
      region: 'coast',
    });
    expect(advice.verdict).toBe(log.outcome);
    expect(advice.explanation.length).toBeGreaterThan(10);
    expect(advice.suggestions).toHaveLength(verified.length);
  });

  it('formatImpact renders measured deltas', () => {
    const s = iceMageOnCoast();
    const cmp = compareBuilds(
      s,
      s.build,
      { slots: ['m_focus', 'm_ember_rain', 'm_living_flame', 'm_fire_bolt'] },
      { kind: 'boss', region: 'coast' },
      6,
    );
    expect(formatImpact(cmp)).toMatch(/DPS|victoires/);
    expect(formatImpact({ ...cmp, winRateDelta: 0, dpsDeltaPct: 0, enemyHpDelta: 0 })).toBe(
      'impact négligeable',
    );
  });
});
