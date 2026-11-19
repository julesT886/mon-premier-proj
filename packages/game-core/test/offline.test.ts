import { describe, expect, it } from 'vitest';
import {
  BASE_OFFLINE_CAP_MS,
  BOOSTED_OFFLINE_CAP_MS,
  CHUNK_MS,
  computeOfflineProgress,
  createNewGame,
  grantProduct,
  type GameState,
  type OfflineResult,
} from '../src/index';

const H = 60 * 60 * 1000;
const T0 = 1_700_000_000_000;

const fresh = (classId: 'warrior' | 'mage' = 'warrior', seed = 'player-seed-42'): GameState =>
  createNewGame({ heroName: 'Aria', classId, playerSeed: seed });

/** Enchaîne plusieurs appels, comme un joueur qui revient plusieurs fois. */
function runSegments(state: GameState, start: number, boundaries: number[]) {
  let s = state;
  let last = start;
  const results: OfflineResult[] = [];
  for (const b of boundaries) {
    const r = computeOfflineProgress(s, last, b);
    results.push(r);
    s = r.state;
    last = b;
  }
  return { state: s, results };
}

describe('computeOfflineProgress — reproductibility', () => {
  it('is pure: same input → identical output, input not mutated', () => {
    const s = fresh();
    const snapshot = JSON.stringify(s);
    const a = computeOfflineProgress(s, T0, T0 + 6 * H);
    const b = computeOfflineProgress(s, T0, T0 + 6 * H);
    expect(a).toEqual(b);
    expect(JSON.stringify(s)).toBe(snapshot);
  });

  it('2 × 6 h is strictly identical to 12 h (state, events and rewards)', () => {
    const s = fresh();
    const whole = computeOfflineProgress(s, T0, T0 + 12 * H);
    const split = runSegments(s, T0, [T0 + 6 * H, T0 + 12 * H]);
    expect(split.state).toEqual(whole.state);
    expect(split.results.flatMap((r) => r.events)).toEqual(whole.events);
    expect(split.results.reduce((n, r) => n + r.rewards.kills, 0)).toBe(whole.rewards.kills);
    expect(split.results.reduce((n, r) => n + r.rewards.xp, 0)).toBe(whole.rewards.xp);
  });

  it('uneven splits not aligned on chunks are still identical', () => {
    const s = fresh('mage');
    const whole = computeOfflineProgress(s, T0, T0 + 10 * H);
    const split = runSegments(s, T0, [
      T0 + 77 * 60_000 + 13_000,
      T0 + 3 * H + 1,
      T0 + 3 * H + 2 * 60_000,
      T0 + 10 * H,
    ]);
    expect(split.state).toEqual(whole.state);
    expect(split.results.flatMap((r) => r.events)).toEqual(whole.events);
  });

  it('matches a frozen golden result for a fixed seed (12 h, fresh warrior)', () => {
    const r = computeOfflineProgress(fresh(), T0, T0 + 12 * H);
    expect({
      level: r.state.hero.level,
      xp: r.state.hero.xp,
      resources: r.state.resources,
      kills: r.rewards.kills,
      combats: r.rewards.combats,
      events: r.events.map((e) => e.type),
      region: r.state.regions,
    }).toMatchSnapshot();
  });

  it('different player seeds diverge', () => {
    const a = computeOfflineProgress(fresh('warrior', 'a'), T0, T0 + 12 * H);
    const b = computeOfflineProgress(fresh('warrior', 'b'), T0, T0 + 12 * H);
    expect(a.state).not.toEqual(b.state);
  });

  it('computes 12 h quickly', () => {
    const start = performance.now();
    computeOfflineProgress(fresh(), T0, T0 + 12 * H);
    expect(performance.now() - start).toBeLessThan(1000);
  });
});

describe('computeOfflineProgress — cap and edge cases', () => {
  it('caps at 12 h: 30 h away gives the same state as 12 h', () => {
    const s = fresh();
    const twelve = computeOfflineProgress(s, T0, T0 + 12 * H);
    const thirty = computeOfflineProgress(s, T0, T0 + 30 * H);
    expect(thirty.state).toEqual(twelve.state);
    expect(thirty.creditedMs).toBe(BASE_OFFLINE_CAP_MS);
    expect(thirty.overflowMs).toBe(18 * H);
  });

  it('the offline booster raises the cap to 16 h', () => {
    const s = fresh();
    s.entitlements = grantProduct(s.entitlements, 'offline_boost');
    const r = computeOfflineProgress(s, T0, T0 + 30 * H);
    expect(r.creditedMs).toBe(BOOSTED_OFFLINE_CAP_MS);
  });

  it('accepts an explicit cap override', () => {
    const r = computeOfflineProgress(fresh(), T0, T0 + 5 * H, { capMs: H });
    expect(r.creditedMs).toBe(H);
  });

  it('returns no progress for zero or negative elapsed time (clock skew)', () => {
    const s = fresh();
    for (const now of [T0, T0 - 5 * H]) {
      const r = computeOfflineProgress(s, T0, now);
      expect(r.elapsedMs).toBe(0);
      expect(r.state).toEqual(s);
      expect(r.events).toEqual([]);
    }
  });

  it('time shorter than a chunk is carried over, not lost', () => {
    const s = fresh();
    const r1 = computeOfflineProgress(s, T0, T0 + CHUNK_MS - 1000);
    expect(r1.rewards.combats).toBe(0);
    expect(r1.state.progress.carryMs).toBe(CHUNK_MS - 1000);
    const r2 = computeOfflineProgress(r1.state, T0 + CHUNK_MS - 1000, T0 + CHUNK_MS);
    expect(r2.rewards.combats).toBeGreaterThan(0);
    expect(r2.state.progress.carryMs).toBe(0);
  });
});

describe('computeOfflineProgress — content', () => {
  const r = computeOfflineProgress(fresh(), T0, T0 + 12 * H);

  it('grants xp, gold, region material and levels', () => {
    expect(r.rewards.kills).toBeGreaterThan(0);
    expect(r.rewards.xp).toBeGreaterThan(0);
    expect(r.rewards.resources.gold).toBeGreaterThan(0);
    expect(r.levelsGained).toBeGreaterThan(0);
    expect(r.events.filter((e) => e.type === 'level_up')).toHaveLength(r.levelsGained);
  });

  it('emits skill unlocks, defeats the forest boss and unlocks the volcano', () => {
    const types = r.events.map((e) => e.type);
    expect(types).toContain('skill_unlocked');
    expect(types).toContain('boss_defeated');
    expect(types).toContain('region_unlocked');
    expect(r.state.regions.volcano.unlocked).toBe(true);
    expect(r.bossCombats.length).toBeGreaterThan(0);
  });

  it('events are chronological and inside the credited window', () => {
    for (let i = 1; i < r.events.length; i++) {
      expect(r.events[i]!.ts).toBeGreaterThanOrEqual(r.events[i - 1]!.ts);
    }
    for (const e of r.events) {
      expect(e.ts).toBeGreaterThan(T0);
      expect(e.ts).toBeLessThanOrEqual(T0 + 12 * H);
    }
  });

  it('keeps a bounded sample of combats without detailed events', () => {
    expect(r.sampleCombats.length).toBeLessThanOrEqual(5);
    expect(r.sampleCombats.every((c) => c.events.length === 0)).toBe(true);
  });

  it('a failed boss attempt waits before retrying', () => {
    // Héros de niveau 2 forcé à avoir atteint le seuil : il échoue et doit patienter.
    const s = fresh();
    s.regions.forest.killsSinceBossAttempt = 999;
    const res = computeOfflineProgress(s, T0, T0 + 30 * 60_000);
    const fails = res.events.filter((e) => e.type === 'boss_failed');
    expect(fails).toHaveLength(1);
    expect(res.state.regions.forest.bossRetryAtChunk).toBeGreaterThan(0);
  });

  it('merchants and treasures can appear over long periods', () => {
    let s = fresh('mage', 'merchant-hunt');
    const types = new Set<string>();
    for (let day = 0; day < 6; day++) {
      const res = computeOfflineProgress(s, T0 + day * 12 * H, T0 + (day + 1) * 12 * H);
      res.events.forEach((e) => types.add(e.type));
      s = res.state;
    }
    expect(types.has('merchant')).toBe(true);
    expect(types.has('dual_class_unlocked')).toBe(true);
  });
});
