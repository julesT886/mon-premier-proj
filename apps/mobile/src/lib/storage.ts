import { parseSavedState } from '@brumeterre/game-core';
import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import {
  DEFAULT_SETTINGS,
  JOURNAL_LIMIT,
  type JournalCombat,
  type JournalRecap,
  type SaveData,
  type Storage,
} from './storage.types';

/** Persistance native (iOS/Android) via expo-sqlite. Voir storage.web.ts pour le web. */
let dbPromise: Promise<SQLiteDatabase> | null = null;

function db(): Promise<SQLiteDatabase> {
  dbPromise ??= openDatabaseAsync('brumeterre.db').then(async (d) => {
    await d.execAsync(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS save (id INTEGER PRIMARY KEY CHECK (id = 1), json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS combats (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS recaps (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, json TEXT NOT NULL);
    `);
    return d;
  });
  return dbPromise;
}

async function trim(d: SQLiteDatabase, table: 'combats' | 'recaps') {
  await d.runAsync(
    `DELETE FROM ${table} WHERE id NOT IN (SELECT id FROM ${table} ORDER BY id DESC LIMIT ?)`,
    JOURNAL_LIMIT,
  );
}

export const storage: Storage = {
  async load() {
    const row = await (
      await db()
    ).getFirstAsync<{ json: string }>('SELECT json FROM save WHERE id = 1');
    if (!row) return null;
    const raw = JSON.parse(row.json) as Partial<SaveData>;
    const state = parseSavedState(raw.state);
    if (!state || typeof raw.lastSeenTs !== 'number') return null;
    return {
      state,
      lastSeenTs: raw.lastSeenTs,
      settings: { ...DEFAULT_SETTINGS, ...raw.settings },
      deviceId: raw.deviceId ?? '',
      apiToken: raw.apiToken ?? '',
    };
  },
  async save(data) {
    await (
      await db()
    ).runAsync(
      'INSERT INTO save (id, json) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET json = excluded.json',
      JSON.stringify(data),
    );
  },
  async addCombat(entry: JournalCombat) {
    const d = await db();
    await d.runAsync(
      'INSERT INTO combats (ts, json) VALUES (?, ?)',
      entry.ts,
      JSON.stringify(entry),
    );
    await trim(d, 'combats');
  },
  async listCombats(limit) {
    const rows = await (
      await db()
    ).getAllAsync<{ json: string }>('SELECT json FROM combats ORDER BY id DESC LIMIT ?', limit);
    return rows.map((r) => JSON.parse(r.json) as JournalCombat);
  },
  async addRecap(entry: JournalRecap) {
    const d = await db();
    await d.runAsync(
      'INSERT INTO recaps (ts, json) VALUES (?, ?)',
      entry.ts,
      JSON.stringify(entry),
    );
    await trim(d, 'recaps');
  },
  async listRecaps(limit) {
    const rows = await (
      await db()
    ).getAllAsync<{ json: string }>('SELECT json FROM recaps ORDER BY id DESC LIMIT ?', limit);
    return rows.map((r) => JSON.parse(r.json) as JournalRecap);
  },
  async reset() {
    await (await db()).execAsync('DELETE FROM save; DELETE FROM combats; DELETE FROM recaps;');
  },
};
