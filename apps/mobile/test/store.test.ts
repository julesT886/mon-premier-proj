import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JournalCombat, JournalRecap, SaveData, Storage } from '../src/lib/storage.types';

// --- Doubles des modules natifs ------------------------------------------------

const memory = vi.hoisted(() => ({
  save: null as SaveData | null,
  combats: [] as JournalCombat[],
  recaps: [] as JournalRecap[],
}));

vi.mock('expo-crypto', () => {
  let n = 0;
  return { randomUUID: () => `uuid-${(n += 1).toString().padStart(8, '0')}` };
});

vi.mock('../src/lib/storage', () => {
  const storage: Storage = {
    load: async () => (memory.save ? structuredClone(memory.save) : null),
    save: async (d) => void (memory.save = structuredClone(d)),
    addCombat: async (e) => void memory.combats.unshift(e),
    listCombats: async (limit) => memory.combats.slice(0, limit),
    addRecap: async (e) => void memory.recaps.unshift(e),
    listRecaps: async (limit) => memory.recaps.slice(0, limit),
    reset: async () => {
      memory.save = null;
      memory.combats = [];
      memory.recaps = [];
    },
  };
  return { storage };
});

const { useGame, getApi } = await import('../src/store/game');

const H = 3600_000;
const T0 = 1_800_000_000_000;
const recap = { story: 'Une histoire.', hook: 'Reviens.', source: 'template' as const };
const flushPersist = () => new Promise((r) => setTimeout(r, 300));

beforeEach(async () => {
  await useGame.getState().reset();
  useGame.setState({ ready: false });
});

describe('game store', () => {
  it('starts without a save, then creates and persists a hero', async () => {
    await useGame.getState().init(T0);
    expect(useGame.getState()).toMatchObject({ ready: true, save: null });

    await useGame.getState().createHero('  Lyra  ', 'mage', T0);
    const save = useGame.getState().save;
    expect(save?.state.hero).toMatchObject({ name: 'Lyra', classId: 'mage', level: 1 });
    expect(save?.deviceId).toMatch(/^uuid-/);
    expect(memory.save?.state.playerSeed).toBe(save?.state.playerSeed);
  });

  it('a long absence waits for « Collect », then applies the exact computed state', async () => {
    await useGame.getState().createHero('Aria', 'warrior', T0);
    const before = useGame.getState().save!.state;

    useGame.getState().resume(T0 + 6 * H);
    const pending = useGame.getState().pending;
    expect(pending?.result.rewards.kills).toBeGreaterThan(0);
    expect(useGame.getState().save!.state).toBe(before); // rien n'est appliqué avant la collecte

    useGame.getState().tick(T0 + 7 * H); // ignoré tant que la collecte est en attente
    expect(useGame.getState().save!.state).toBe(before);

    await useGame.getState().collect(recap);
    const after = useGame.getState().save!;
    expect(useGame.getState().pending).toBeNull();
    expect(after.state).toEqual(pending!.result.state);
    expect(after.lastSeenTs).toBe(T0 + 6 * H);
    expect(memory.recaps[0]).toMatchObject({ recap, kills: pending!.result.rewards.kills });
    expect(memory.save?.lastSeenTs).toBe(T0 + 6 * H);
  });

  it('a short absence is applied silently by tick', async () => {
    await useGame.getState().createHero('Aria', 'warrior', T0);
    useGame.getState().resume(T0 + 60_000);
    expect(useGame.getState().pending).toBeNull();
    useGame.getState().tick(T0 + 11 * 60_000);
    const save = useGame.getState().save!;
    expect(save.lastSeenTs).toBe(T0 + 11 * 60_000);
    expect(save.state.lifetime.combats).toBeGreaterThan(0);
  });

  it('online ticks and offline collection give the same state (single engine)', async () => {
    await useGame.getState().createHero('Aria', 'warrior', T0);
    for (let m = 1; m <= 120; m++) useGame.getState().tick(T0 + m * 60_000);
    const online = useGame.getState().save!.state;

    await useGame.getState().reset();
    await useGame.getState().createHero('Aria', 'warrior', T0);
    useGame.setState({
      save: {
        ...useGame.getState().save!,
        state: { ...useGame.getState().save!.state, playerSeed: online.playerSeed },
      },
    });
    useGame.getState().resume(T0 + 120 * 60_000);
    await useGame.getState().collect(null);
    expect(useGame.getState().save!.state).toEqual(online);
  });

  it('rejects invalid builds, locked regions and unaffordable upgrades', async () => {
    await useGame.getState().createHero('Aria', 'warrior', T0);
    const { setBuild, travel, upgrade } = useGame.getState();
    expect(setBuild({ slots: ['w_charge', null, null, null] })).toBe(false);
    expect(travel('volcano')).toBe(false);
    expect(upgrade('w_rend')).toBe(false);
    expect(setBuild({ slots: ['w_rend', 'w_heavy_strike', null, null] })).toBe(true);
    await flushPersist();
    expect(memory.save?.state.build.slots).toEqual(['w_rend', 'w_heavy_strike', null, null]);
  });

  it('settings are persisted and survive a restart', async () => {
    await useGame.getState().createHero('Aria', 'warrior', T0);
    useGame.getState().updateSettings({ tone: 'cozy', locale: 'en' });
    await flushPersist();
    useGame.setState({ save: null, ready: false });
    await useGame.getState().init(T0 + 1000);
    expect(useGame.getState().save?.settings).toMatchObject({ tone: 'cozy', locale: 'en' });
  });

  it('has no API client without EXPO_PUBLIC_API_URL (fully offline)', async () => {
    await useGame.getState().createHero('Aria', 'warrior', T0);
    expect(getApi()).toBeNull();
  });

  it('reset wipes the save and the journal', async () => {
    await useGame.getState().createHero('Aria', 'warrior', T0);
    await useGame.getState().reset();
    expect(useGame.getState().save).toBeNull();
    expect(memory.save).toBeNull();
  });
});
