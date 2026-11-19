import { parseSavedState } from '@brumeterre/game-core';
import {
  DEFAULT_SETTINGS,
  JOURNAL_LIMIT,
  type JournalCombat,
  type JournalRecap,
  type SaveData,
  type Storage,
} from './storage.types';

/** Persistance web (aperçu navigateur) : localStorage, tolérant aux erreurs. */
const KEYS = { save: 'bt.save', combats: 'bt.combats', recaps: 'bt.recaps' } as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = globalThis.localStorage?.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    globalThis.localStorage?.setItem(key, JSON.stringify(value));
  } catch {
    // stockage indisponible (navigation privée) : le jeu reste jouable en mémoire
  }
}

export const storage: Storage = {
  async load() {
    const raw = read<Partial<SaveData> | null>(KEYS.save, null);
    const state = parseSavedState(raw?.state);
    if (!raw || !state || typeof raw.lastSeenTs !== 'number') return null;
    return {
      state,
      lastSeenTs: raw.lastSeenTs,
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      deviceId: raw.deviceId ?? '',
      apiToken: raw.apiToken ?? '',
    };
  },
  async save(data) {
    write(KEYS.save, data);
  },
  async addCombat(entry: JournalCombat) {
    write(
      KEYS.combats,
      [entry, ...read<JournalCombat[]>(KEYS.combats, [])].slice(0, JOURNAL_LIMIT),
    );
  },
  async listCombats(limit) {
    return read<JournalCombat[]>(KEYS.combats, []).slice(0, limit);
  },
  async addRecap(entry: JournalRecap) {
    write(KEYS.recaps, [entry, ...read<JournalRecap[]>(KEYS.recaps, [])].slice(0, JOURNAL_LIMIT));
  },
  async listRecaps(limit) {
    return read<JournalRecap[]>(KEYS.recaps, []).slice(0, limit);
  },
  async reset() {
    for (const key of Object.values(KEYS)) {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        // ignore
      }
    }
  },
};
