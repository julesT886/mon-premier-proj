import { describe, expect, it } from 'vitest';
import { deriveSeed, hashString, Rng } from '../src/rng';

describe('Rng', () => {
  it('is deterministic for a given seed', () => {
    const a = new Rng('seed-1');
    const b = new Rng('seed-1');
    const seqA = Array.from({ length: 50 }, () => a.nextUint32());
    const seqB = Array.from({ length: 50 }, () => b.nextUint32());
    expect(seqA).toEqual(seqB);
  });

  it('produces a frozen sequence (cross-engine regression guard)', () => {
    const rng = new Rng('brumeterre');
    expect(Array.from({ length: 5 }, () => rng.nextUint32())).toMatchSnapshot();
  });

  it('differs for different seeds', () => {
    const a = new Rng('seed-1').nextUint32();
    const b = new Rng('seed-2').nextUint32();
    expect(a).not.toBe(b);
  });

  it('next() stays in [0, 1) and is roughly uniform', () => {
    const rng = new Rng('uniform');
    let sum = 0;
    for (let i = 0; i < 10_000; i++) {
      const x = rng.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
      sum += x;
    }
    expect(sum / 10_000).toBeGreaterThan(0.48);
    expect(sum / 10_000).toBeLessThan(0.52);
  });

  it('int() respects inclusive bounds', () => {
    const rng = new Rng('int');
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) seen.add(rng.int(2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it('pick() and weighted() return members', () => {
    const rng = new Rng('pick');
    expect(['a', 'b']).toContain(rng.pick(['a', 'b']));
    expect(() => rng.pick([])).toThrow();
    for (let i = 0; i < 100; i++) expect(rng.weighted(['x', 'y'], [0, 1])).toBe('y');
  });

  it('snapshot() exposes the internal state', () => {
    const rng = new Rng('snap');
    const s = rng.snapshot();
    expect(Object.keys(s)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('hashString and deriveSeed are stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(deriveSeed('p', 'chunk', 3)).toBe('p:chunk:3');
  });
});
