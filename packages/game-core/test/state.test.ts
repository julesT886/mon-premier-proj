import { describe, expect, it } from 'vitest';
import {
  applyBuild,
  buildLocalRecap,
  CATALOG,
  computeOfflineProgress,
  countWords,
  createNewGame,
  defaultEntitlements,
  grantEntitlements,
  grantProduct,
  offlineCapMs,
  parseSavedState,
  RECAP_MAX_WORDS,
  RECAP_MIN_WORDS,
  RECAP_TONES,
  travelTo,
  upgradeSkill,
  type OfflineEvent,
} from '../src/index';

describe('game state actions', () => {
  const s = createNewGame({ heroName: 'Aria', classId: 'warrior', playerSeed: 'x' });

  it('creates a level 1 hero in the forest with Pip', () => {
    expect(s.hero.level).toBe(1);
    expect(s.activeRegion).toBe('forest');
    expect(s.companions).toEqual(['pip']);
    expect(s.regions.forest.unlocked).toBe(true);
    expect(s.regions.volcano.unlocked).toBe(false);
  });

  it('travelTo refuses locked regions and adds the local companion', () => {
    expect(travelTo(s, 'volcano')).toEqual({ ok: false, error: 'region_locked' });
    const unlocked = {
      ...s,
      regions: { ...s.regions, volcano: { ...s.regions.volcano, unlocked: true } },
    };
    const r = travelTo(unlocked, 'volcano');
    expect(r.ok && r.state.companions).toEqual(['pip', 'brannoc']);
    const again = r.ok ? travelTo(r.state, 'volcano') : r;
    expect(again.ok && again.state.companions).toEqual(['pip', 'brannoc']);
  });

  it('upgradeSkill spends gold and caps the rank', () => {
    expect(upgradeSkill(s, 'w_rend')).toEqual({ ok: false, error: 'not_enough_gold' });
    let rich = { ...s, resources: { ...s.resources, gold: 1_000_000 } };
    for (let i = 0; i < 4; i++) {
      const r = upgradeSkill(rich, 'w_rend');
      expect(r.ok).toBe(true);
      if (r.ok) rich = r.state;
    }
    expect(rich.skillRanks.w_rend).toBe(5);
    expect(upgradeSkill(rich, 'w_rend')).toEqual({ ok: false, error: 'max_rank' });
  });

  it('applyBuild validates the build', () => {
    expect(applyBuild(s, { slots: ['w_charge', null, null, null] })).toEqual({
      ok: false,
      error: 'invalid_build',
    });
    const r = applyBuild(s, { slots: ['w_rend', 'w_heavy_strike', null, null] });
    expect(r.ok && r.state.build.slots).toEqual(['w_rend', 'w_heavy_strike', null, null]);
  });

  it('parseSavedState round-trips JSON and rejects garbage', () => {
    expect(parseSavedState(JSON.parse(JSON.stringify(s)))).toEqual(s);
    expect(parseSavedState(null)).toBeNull();
    expect(parseSavedState({ version: 99 })).toBeNull();
  });
});

describe('monetization', () => {
  it('base cap is 12 h, booster 16 h', () => {
    const e = defaultEntitlements();
    expect(offlineCapMs(e)).toBe(12 * 3600_000);
    expect(offlineCapMs(grantProduct(e, 'offline_boost'))).toBe(16 * 3600_000);
  });

  it('grants are idempotent and unknown products are ignored', () => {
    let e = defaultEntitlements();
    e = grantProduct(e, 'cosmetic_mist_cloak');
    e = grantProduct(e, 'cosmetic_mist_cloak');
    expect(e.cosmetics).toEqual(['cosmetic_mist_cloak']);
    expect(grantProduct(e, 'season_pass_s1').seasonPass).toEqual({ seasonId: 'season_pass_s1' });
    expect(grantProduct(e, 'nope')).toBe(e);
  });

  it('catalog has no loot box and no combat power', () => {
    expect(CATALOG.map((p) => p.kind).sort()).toEqual(['cosmetic', 'offline_boost', 'season_pass']);
  });

  it('grantEntitlements replaces entitlements on the state', () => {
    const s = createNewGame({ heroName: 'A', classId: 'mage', playerSeed: 'm' });
    const e = grantProduct(defaultEntitlements(), 'offline_boost');
    expect(grantEntitlements(s, e).entitlements.offlineBoost).toBe(true);
  });
});

describe('buildLocalRecap', () => {
  const base = createNewGame({ heroName: 'Aria', classId: 'mage', playerSeed: 'recap' });
  const offline = computeOfflineProgress(base, 0, 12 * 3600_000);

  const scenarios: { name: string; events: OfflineEvent[]; kills: number }[] = [
    { name: 'empty', events: [], kills: 0 },
    { name: 'real 12h', events: offline.events, kills: offline.rewards.kills },
    {
      name: 'busy',
      kills: 900,
      events: [
        { ts: 1, type: 'boss_failed', enemyId: 'bramble_mother', region: 'forest' },
        { ts: 2, type: 'boss_failed', enemyId: 'bramble_mother', region: 'forest' },
        { ts: 3, type: 'boss_defeated', enemyId: 'bramble_mother', region: 'forest' },
        { ts: 3, type: 'region_unlocked', region: 'volcano' },
        { ts: 3, type: 'rare_item', relicId: 'lantern_seed' },
        { ts: 4, type: 'merchant', gold: 120, sold: 40, resource: 'moonsap' },
        { ts: 5, type: 'treasure', gold: 400 },
        { ts: 6, type: 'dual_class_unlocked', classId: 'warrior' },
        { ts: 7, type: 'level_up', level: 8 },
        { ts: 8, type: 'level_up', level: 9 },
        { ts: 8, type: 'skill_unlocked', skillId: 'm_time_warp' },
      ],
    },
  ];

  for (const locale of ['fr', 'en'] as const)
    for (const tone of RECAP_TONES) {
      for (const sc of scenarios) {
        it(`${locale} / ${tone} / ${sc.name}: ${RECAP_MIN_WORDS}-${RECAP_MAX_WORDS} words + hook`, () => {
          const recap = buildLocalRecap({
            locale,
            heroName: 'Aria',
            region: 'forest',
            companions: ['pip'],
            tone,
            events: sc.events,
            kills: sc.kills,
            elapsedMs: 12 * 3600_000,
          });
          const words = countWords(recap.story);
          expect(words).toBeGreaterThanOrEqual(RECAP_MIN_WORDS);
          expect(words).toBeLessThanOrEqual(RECAP_MAX_WORDS);
          expect(recap.hook.length).toBeGreaterThan(10);
          expect(recap.source).toBe('template');
        });
      }
    }

  it('is deterministic and mentions the main beat', () => {
    const input = {
      heroName: 'Aria',
      region: 'forest' as const,
      companions: ['pip'],
      tone: 'epic' as const,
      events: scenarios[2]!.events,
      kills: 900,
      elapsedMs: 5 * 60_000,
    };
    expect(buildLocalRecap(input)).toEqual(buildLocalRecap(input));
    expect(buildLocalRecap(input).story).toContain('La Mère-Ronce');
    expect(buildLocalRecap(input).hook).toContain('Cœur-de-Braise');
  });

  it('writes the English recap with English content names', () => {
    const recap = buildLocalRecap({
      locale: 'en',
      heroName: 'Aria',
      region: 'forest',
      companions: ['pip'],
      tone: 'epic',
      kills: 50,
      elapsedMs: 3 * 3600_000,
      events: [
        { ts: 1, type: 'boss_defeated', enemyId: 'bramble_mother', region: 'forest' },
        { ts: 1, type: 'region_unlocked', region: 'volcano' },
      ],
    });
    expect(recap.story).toContain('The Bramble Mother');
    expect(recap.story).toContain('3 hours');
    expect(recap.hook).toContain('Emberheart');
  });

  it('skips a boss failure followed by its defeat and groups relics', () => {
    const story = buildLocalRecap({
      heroName: 'Aria',
      region: 'forest',
      companions: ['pip'],
      tone: 'epic',
      kills: 50,
      elapsedMs: 3600_000,
      events: [
        { ts: 1, type: 'boss_failed', enemyId: 'bramble_mother', region: 'forest' },
        { ts: 2, type: 'boss_defeated', enemyId: 'bramble_mother', region: 'forest' },
        { ts: 2, type: 'rare_item', relicId: 'lantern_seed' },
        { ts: 3, type: 'rare_item', relicId: 'mossheart_charm' },
      ],
    }).story;
    expect(story).not.toContain('repoussé');
    expect(story).toContain('des reliques : Graine-lanterne et Charme cœur-de-mousse');
  });
});
