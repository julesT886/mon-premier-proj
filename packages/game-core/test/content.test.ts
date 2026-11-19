import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  COMPANIONS_BY_ID,
  ENEMIES,
  ENEMIES_BY_ID,
  REGIONS,
  RELICS_BY_ID,
  SKILLS,
  SKILLS_BY_ID,
  SYNERGIES,
  XP_TO_NEXT,
  MAX_LEVEL,
  getSkill,
  getEnemy,
} from '../src/index';

describe('content integrity', () => {
  it('has 30 skills, 15 per class, unique ids, at least one tag each', () => {
    expect(SKILLS).toHaveLength(30);
    expect(SKILLS.filter((s) => s.classId === 'warrior')).toHaveLength(15);
    expect(SKILLS.filter((s) => s.classId === 'mage')).toHaveLength(15);
    expect(new Set(SKILLS.map((s) => s.id)).size).toBe(30);
    for (const s of SKILLS) {
      expect(s.tags.length).toBeGreaterThan(0);
      expect(s.effects.length).toBeGreaterThan(0);
      expect(s.cooldownMs).toBeGreaterThan(0);
    }
  });

  it('every tag combination used by synergies exists on some skill', () => {
    const tags = new Set(SKILLS.flatMap((s) => s.tags));
    for (const syn of SYNERGIES) {
      for (const req of syn.requires) for (const t of req.anyOf) expect(tags.has(t)).toBe(true);
    }
  });

  it('class starter skills exist, belong to the class and are level 1', () => {
    for (const cls of Object.values(CLASSES)) {
      for (const id of cls.starterSkills) {
        const s = SKILLS_BY_ID[id];
        expect(s?.classId).toBe(cls.id);
        expect(s?.requiredLevel).toBe(1);
      }
    }
  });

  it('regions reference existing enemies, bosses, relics and companions', () => {
    expect(REGIONS).toHaveLength(3);
    for (const r of REGIONS) {
      for (const id of r.enemies) {
        expect(ENEMIES_BY_ID[id]?.region).toBe(r.id);
        expect(ENEMIES_BY_ID[id]?.isBoss).toBe(false);
      }
      expect(ENEMIES_BY_ID[r.boss]?.isBoss).toBe(true);
      for (const id of r.relics) expect(RELICS_BY_ID[id]).toBeDefined();
      expect(COMPANIONS_BY_ID[r.companion]).toBeDefined();
    }
    expect(ENEMIES).toHaveLength(15);
  });

  it('region unlock chain is linear from the forest', () => {
    expect(REGIONS.map((r) => r.unlockedBy)).toEqual([null, 'forest', 'volcano']);
  });

  it('xp table covers levels 1..MAX_LEVEL-1 and is increasing', () => {
    expect(XP_TO_NEXT).toHaveLength(MAX_LEVEL - 1);
    for (let i = 1; i < XP_TO_NEXT.length; i++) {
      expect(XP_TO_NEXT[i]!).toBeGreaterThan(XP_TO_NEXT[i - 1]!);
    }
  });

  it('getters throw on unknown ids', () => {
    expect(() => getSkill('nope')).toThrow();
    expect(() => getEnemy('nope')).toThrow();
  });
});

describe('determinism guard', () => {
  it('simulation code avoids engine-dependent Math functions and ambient time/randomness', () => {
    const forbidden =
      /Math\.(pow|log|log2|log10|exp|sqrt|cbrt|sin|cos|tan|atan2?|hypot|random)\b|Date\.now|new Date\(/;
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(join(dir, d.name)) : [join(dir, d.name)],
      );
    const offenders = walk(join(__dirname, '../src')).filter((f) =>
      forbidden.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });
});
