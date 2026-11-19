import { describe, expect, it } from 'vitest';
import {
  heroStats,
  makeEnemy,
  makeHero,
  simulateCombat,
  type CombatEvent,
  type SkillId,
} from '../src/index';

const warrior = (level: number, slots: (SkillId | null)[], ranks: Record<string, number> = {}) =>
  makeHero('warrior', level, heroStats('warrior', level), slots, ranks);
const mage = (level: number, slots: (SkillId | null)[]) =>
  makeHero('mage', level, heroStats('mage', level), slots);

const STARTER_W: (SkillId | null)[] = ['w_heavy_strike', 'w_rend', 'w_war_cry', null];

describe('simulateCombat — determinism', () => {
  it('same inputs and seed produce an identical log', () => {
    const a = simulateCombat(warrior(5, STARTER_W), makeEnemy('bramble_ox', 5), 'fixed-seed');
    const b = simulateCombat(warrior(5, STARTER_W), makeEnemy('bramble_ox', 5), 'fixed-seed');
    expect(a).toEqual(b);
  });

  it('different seeds can diverge', () => {
    const logs = ['s1', 's2', 's3', 's4', 's5'].map(
      (s) => simulateCombat(warrior(5, STARTER_W), makeEnemy('bramble_ox', 5), s).stats,
    );
    const distinct = new Set(logs.map((l) => l.totalDamageTaken));
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('matches frozen golden results on fixed seeds', () => {
    const fights = [
      simulateCombat(warrior(5, STARTER_W), makeEnemy('bramble_ox', 5), 'golden-1'),
      simulateCombat(
        mage(18, ['m_focus', 'm_frost_shard', 'm_ice_lance', 'm_frost_nova']),
        makeEnemy('vorhast', 18),
        'golden-2',
      ),
      simulateCombat(warrior(3, STARTER_W), makeEnemy('bramble_mother', 8), 'golden-3'),
    ];
    expect(
      fights.map((f) => ({
        outcome: f.outcome,
        endReason: f.endReason,
        durationMs: f.durationMs,
        heroHp: f.hero.hpLeft,
        enemyHp: f.enemy.hpLeft,
        dealt: f.stats.totalDamageDealt,
        taken: f.stats.totalDamageTaken,
        events: f.events.length,
      })),
    ).toMatchSnapshot();
  });

  it('recordEvents: false keeps identical stats without events', () => {
    const full = simulateCombat(warrior(5, STARTER_W), makeEnemy('moss_wolf', 5), 'x');
    const lite = simulateCombat(warrior(5, STARTER_W), makeEnemy('moss_wolf', 5), 'x', {
      recordEvents: false,
    });
    expect(lite.events).toEqual([]);
    expect(lite.stats).toEqual(full.stats);
    expect(lite.outcome).toBe(full.outcome);
  });
});

describe('simulateCombat — log structure', () => {
  const log = simulateCombat(warrior(6, STARTER_W), makeEnemy('capgnome', 6), 'structure');

  it('events are time-ordered and end with a death on a decisive fight', () => {
    for (let i = 1; i < log.events.length; i++) {
      expect(log.events[i]!.t).toBeGreaterThanOrEqual(log.events[i - 1]!.t);
    }
    expect(log.events.at(-1)?.type).toBe('death');
  });

  it('damage by source sums to total and dps is computed', () => {
    const sum = Object.values(log.stats.damageBySource).reduce((a, b) => a + b, 0);
    expect(sum).toBe(log.stats.totalDamageDealt);
    expect(log.stats.dpsBySource.basic).toBeGreaterThan(0);
    const taken = Object.values(log.stats.damageTakenBySource).reduce((a, b) => a + b, 0);
    expect(taken).toBe(log.stats.totalDamageTaken);
  });

  it('casts are counted per build skill, including zero casts', () => {
    expect(Object.keys(log.stats.castsBySkill).sort()).toEqual(
      ['w_heavy_strike', 'w_rend', 'w_war_cry'].sort(),
    );
    expect(log.stats.castsBySkill.w_heavy_strike).toBeGreaterThan(0);
  });

  it('a win leaves the enemy at 0 hp', () => {
    expect(log.outcome).toBe('win');
    expect(log.enemy.hpLeft).toBe(0);
    expect(log.endReason).toBe('enemyDefeated');
  });
});

describe('simulateCombat — mechanics', () => {
  it('an underleveled hero loses to a boss (heroDefeated)', () => {
    const log = simulateCombat(warrior(1, STARTER_W), makeEnemy('vorhast', 18), 'loss');
    expect(log.outcome).toBe('loss');
    expect(log.endReason).toBe('heroDefeated');
    expect(log.hero.hpLeft).toBe(0);
  });

  it('times out when the fight lasts longer than maxDurationMs', () => {
    const log = simulateCombat(warrior(8, STARTER_W), makeEnemy('bramble_mother', 8), 't', {
      maxDurationMs: 2000,
    });
    expect(log.endReason).toBe('timeout');
    expect(log.outcome).toBe('loss');
    expect(log.durationMs).toBe(2000);
  });

  it('buffNotActive skills are not recast while their buff is up', () => {
    const log = simulateCombat(
      warrior(5, ['w_war_cry', null, null, null]),
      makeEnemy('bramble_ox', 5),
      'buff',
    );
    const casts = log.events.filter(
      (e): e is Extract<CombatEvent, { type: 'cast' }> =>
        e.type === 'cast' && e.sourceId === 'w_war_cry',
    );
    for (let i = 1; i < casts.length; i++) {
      expect(casts[i]!.t - casts[i - 1]!.t).toBeGreaterThanOrEqual(8000);
    }
  });

  it('a lone long-cooldown skill produces idle time', () => {
    const log = simulateCombat(
      warrior(5, ['w_war_cry', null, null, null]),
      makeEnemy('bramble_ox', 5),
      'idle',
    );
    expect(log.stats.idleTimeMs).toBeGreaterThan(0);
  });

  it('stun prevents enemy basic attacks while active', () => {
    const log = simulateCombat(
      warrior(5, ['w_shield_bash', null, null, null]),
      makeEnemy('moss_wolf', 5),
      'stun',
    );
    const stun = log.events.find((e) => e.type === 'status' && e.status === 'stun');
    expect(stun).toBeDefined();
    const enemyHitsDuringStun = log.events.filter(
      (e) =>
        e.type === 'damage' &&
        e.actor === 'enemy' &&
        !e.dot &&
        e.t > stun!.t &&
        e.t < stun!.t + 1500,
    );
    expect(enemyHitsDuringStun).toEqual([]);
  });

  it('shields absorb damage and heals trigger under the hp threshold', () => {
    const log = simulateCombat(
      warrior(14, ['w_iron_skin', 'w_second_wind', null, null]),
      makeEnemy('vorhast', 18),
      'tank',
    );
    expect(log.stats.shieldAbsorbed).toBeGreaterThan(0);
    expect(log.stats.healingDone).toBeGreaterThan(0);
  });

  it('skill ranks increase damage', () => {
    const base = simulateCombat(warrior(8, STARTER_W), makeEnemy('bramble_ox', 8), 'rank', {
      maxDurationMs: 5000,
    });
    const ranked = simulateCombat(
      warrior(8, STARTER_W, { w_heavy_strike: 5, w_rend: 5 }),
      makeEnemy('bramble_ox', 8),
      'rank',
      { maxDurationMs: 5000 },
    );
    expect(ranked.stats.damageBySource.w_heavy_strike!).toBeGreaterThan(
      base.stats.damageBySource.w_heavy_strike!,
    );
  });

  it('elemental weakness matters: fire beats ice against the volcano boss', () => {
    // Le volcan résiste au feu et craint la glace.
    const winRate = (slots: (SkillId | null)[]) => {
      let wins = 0;
      for (let i = 0; i < 20; i++) {
        const log = simulateCombat(mage(20, slots), makeEnemy('vorhast', 18), `el-${i}`, {
          recordEvents: false,
        });
        if (log.outcome === 'win') wins++;
      }
      return wins;
    };
    const ice = winRate(['m_focus', 'm_frost_shard', 'm_ice_lance', 'm_frost_nova']);
    const fire = winRate(['m_focus', 'm_ember_rain', 'm_fire_bolt', 'm_combustion']);
    expect(ice).toBeGreaterThan(fire);
  });

  it('reports active synergies in the stats', () => {
    const log = simulateCombat(
      mage(10, ['m_fire_bolt', 'm_combustion', 'm_frost_shard', 'm_focus']),
      makeEnemy('moss_wolf', 8),
      'syn',
    );
    expect(log.stats.activeSynergies).toEqual(expect.arrayContaining(['blaze', 'thermal_shock']));
  });

  it('enemy abilities fire: enrage, self-heal, dot', () => {
    const log = simulateCombat(warrior(8, STARTER_W), makeEnemy('bramble_mother', 8), 'abilities');
    expect(log.events.some((e) => e.type === 'buff' && e.actor === 'enemy')).toBe(true);
    expect(log.events.some((e) => e.type === 'heal' && e.actor === 'enemy')).toBe(true);
    expect(log.events.some((e) => e.type === 'damage' && e.actor === 'enemy' && e.dot)).toBe(true);
  });
});
