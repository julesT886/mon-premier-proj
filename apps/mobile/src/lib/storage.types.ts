import type { CombatSummary, GameState, Locale, Recap, RecapTone } from '@brumeterre/game-core';

export interface Settings {
  locale: Locale;
  tone: RecapTone;
  notifications: boolean;
}

export const DEFAULT_SETTINGS: Settings = { locale: 'fr', tone: 'epic', notifications: false };

export interface SaveData {
  state: GameState;
  lastSeenTs: number;
  settings: Settings;
  deviceId: string;
  apiToken: string;
}

export interface JournalCombat {
  ts: number;
  summary: CombatSummary;
}

export interface JournalRecap {
  ts: number;
  recap: Recap;
  kills: number;
  xp: number;
  gold: number;
  levelsGained: number;
  elapsedMs: number;
}

export interface Storage {
  load(): Promise<SaveData | null>;
  save(data: SaveData): Promise<void>;
  addCombat(entry: JournalCombat): Promise<void>;
  listCombats(limit: number): Promise<JournalCombat[]>;
  addRecap(entry: JournalRecap): Promise<void>;
  listRecaps(limit: number): Promise<JournalRecap[]>;
  reset(): Promise<void>;
}

export const JOURNAL_LIMIT = 50;
