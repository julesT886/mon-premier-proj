import {
  applyBuild,
  computeOfflineProgress,
  createNewGame,
  summarizeCombatLog,
  travelTo,
  upgradeSkill,
  type Build,
  type ClassId,
  type CombatLog,
  type GameState,
  type OfflineEvent,
  type OfflineResult,
  type Recap,
  type RegionId,
  type SkillId,
} from '@brumeterre/game-core';
import { randomUUID } from 'expo-crypto';
import { create } from 'zustand';
import { ApiClient } from '../lib/api';
import { resume as resumeSession } from '../lib/session';
import { storage } from '../lib/storage';
import { DEFAULT_SETTINGS, type SaveData, type Settings } from '../lib/storage.types';

export interface PendingCollect {
  result: OfflineResult;
  computedAt: number;
}

interface GameStore {
  ready: boolean;
  save: SaveData | null;
  /** Gains hors ligne en attente du bouton « Récupérer ». */
  pending: PendingCollect | null;
  /** Dernier combat notable (défaite de boss, ou combat affiché) pour le coach. */
  lastFight: CombatLog | null;
  /** Événements récents de la session en ligne (toasts). */
  recentEvents: OfflineEvent[];

  init(now: number): Promise<void>;
  createHero(name: string, classId: ClassId, now: number): Promise<void>;
  /** Appelé au retour au premier plan : prépare l'écran de récap si l'absence est longue. */
  resume(now: number): void;
  /** Progression en ligne (silencieuse). */
  tick(now: number): void;
  collect(recap: Recap | null): Promise<void>;
  setBuild(build: Build): boolean;
  travel(region: RegionId): boolean;
  upgrade(skillId: SkillId): boolean;
  recordFight(log: CombatLog): void;
  updateSettings(patch: Partial<Settings>): void;
  reset(): Promise<void>;
}

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? '';

let apiClient: ApiClient | null = null;
let apiClientDevice = '';

/** Client API, ou null si aucune URL n'est configurée (jeu 100 % hors ligne). */
export function getApi(): ApiClient | null {
  const save = useGame.getState().save;
  if (!API_URL || !save) return null;
  if (apiClient && apiClientDevice === save.deviceId) return apiClient;
  apiClientDevice = save.deviceId;
  apiClient = new ApiClient({
    baseUrl: API_URL,
    deviceId: save.deviceId,
    tokens: {
      get: async () => useGame.getState().save?.apiToken || null,
      set: async (token) => {
        const s = useGame.getState().save;
        if (s) useGame.setState({ save: { ...s, apiToken: token } });
        persist();
      },
    },
  });
  return apiClient;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const save = useGame.getState().save;
    if (save) void storage.save(save);
  }, 250);
}

function journalBossFights(result: OfflineResult) {
  for (const log of result.bossCombats.slice(-5)) {
    void storage.addCombat({ ts: Date.now(), summary: summarizeCombatLog(log) });
  }
}

export const useGame = create<GameStore>((set, get) => ({
  ready: false,
  save: null,
  pending: null,
  lastFight: null,
  recentEvents: [],

  async init(now) {
    const save = await storage.load();
    set({ save, ready: true });
    if (save) get().resume(now);
  },

  async createHero(name, classId, now) {
    const deviceId = randomUUID();
    const state = createNewGame({
      heroName: name.trim() || 'Aria',
      classId,
      playerSeed: randomUUID(),
    });
    const save: SaveData = {
      state,
      lastSeenTs: now,
      settings: DEFAULT_SETTINGS,
      deviceId,
      apiToken: '',
    };
    set({ save, pending: null, lastFight: null, recentEvents: [] });
    await storage.save(save);
  },

  resume(now) {
    const { save, pending } = get();
    if (!save || pending) return;
    const { result, showRecap } = resumeSession(save.state, save.lastSeenTs, now);
    if (showRecap) {
      set({ pending: { result, computedAt: now } });
      return;
    }
    get().tick(now);
  },

  tick(now) {
    const { save, pending } = get();
    if (!save || pending) return;
    const result = computeOfflineProgress(save.state, save.lastSeenTs, now);
    if (result.creditedMs === 0) return;
    journalBossFights(result);
    const lostBoss = result.bossCombats.findLast((c) => c.outcome === 'loss');
    set({
      save: { ...save, state: result.state, lastSeenTs: now },
      recentEvents: [...get().recentEvents, ...result.events].slice(-10),
      ...(lostBoss ? { lastFight: lostBoss } : {}),
    });
    persist();
  },

  async collect(recap) {
    const { save, pending } = get();
    if (!save || !pending) return;
    const { result, computedAt } = pending;
    journalBossFights(result);
    if (recap) {
      await storage.addRecap({
        ts: computedAt,
        recap,
        kills: result.rewards.kills,
        xp: result.rewards.xp,
        gold: result.rewards.resources.gold,
        levelsGained: result.levelsGained,
        elapsedMs: result.creditedMs,
      });
    }
    const lostBoss = result.bossCombats.findLast((c) => c.outcome === 'loss');
    set({
      save: { ...save, state: result.state, lastSeenTs: computedAt },
      pending: null,
      ...(lostBoss ? { lastFight: lostBoss } : {}),
    });
    await storage.save(get().save as SaveData);
  },

  setBuild(build) {
    const save = get().save;
    if (!save) return false;
    const res = applyBuild(save.state, build);
    if (!res.ok) return false;
    set({ save: { ...save, state: res.state } });
    persist();
    return true;
  },

  travel(region) {
    const save = get().save;
    if (!save) return false;
    const res = travelTo(save.state, region);
    if (!res.ok) return false;
    set({ save: { ...save, state: res.state } });
    persist();
    return true;
  },

  upgrade(skillId) {
    const save = get().save;
    if (!save) return false;
    const res = upgradeSkill(save.state, skillId);
    if (!res.ok) return false;
    set({ save: { ...save, state: res.state } });
    persist();
    return true;
  },

  recordFight(log) {
    set({ lastFight: log });
    void storage.addCombat({ ts: Date.now(), summary: summarizeCombatLog(log) });
  },

  updateSettings(patch) {
    const save = get().save;
    if (!save) return;
    set({ save: { ...save, settings: { ...save.settings, ...patch } } });
    persist();
  },

  async reset() {
    await storage.reset();
    apiClient = null;
    set({ save: null, pending: null, lastFight: null, recentEvents: [] });
  },
}));

/** Raccourci : état de jeu courant (lève si aucune partie). */
export function useGameState(): GameState {
  const state = useGame((s) => s.save?.state);
  if (!state) throw new Error('no game in progress');
  return state;
}

export function useSettings(): Settings {
  return useGame((s) => s.save?.settings ?? DEFAULT_SETTINGS);
}
