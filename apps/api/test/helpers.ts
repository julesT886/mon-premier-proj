import {
  computeOfflineProgress,
  createNewGame,
  heroSnapshot,
  makeEnemy,
  simulateCombat,
  summarizeCombatLog,
  toCoachRequest,
  type CoachRequest,
  type GameState,
  type RecapRequest,
} from '@brumeterre/game-core';
import type { Env } from '../src/env';
import type { LlmClient, LlmRequest, LlmResult } from '../src/llm';

export const TEST_ENV: Env = {
  ANTHROPIC_API_KEY: '',
  COACH_MODEL: 'claude-sonnet-5-5',
  RECAP_MODEL: 'claude-haiku-5-5',
  DEVICE_TOKEN_SECRET: 'test-secret-test-secret',
  PORT: 0,
  HOST: '127.0.0.1',
  LOG_LEVEL: 'silent',
  COACH_DAILY_LIMIT: 3,
  RECAP_DAILY_LIMIT: 2,
  COACH_TIMEOUT_MS: 1000,
  RECAP_TIMEOUT_MS: 100,
  CACHE_TTL_MS: 60_000,
};

export function iceMage(): GameState {
  const s = createNewGame({ heroName: 'Lune', classId: 'mage', playerSeed: 'api' });
  s.hero.level = 26;
  s.activeRegion = 'coast';
  s.build = { slots: ['m_focus', 'm_frost_shard', 'm_ice_lance', 'm_frost_nova'] };
  return s;
}

export function coachRequest(): CoachRequest {
  const s = iceMage();
  const log = simulateCombat(heroSnapshot(s), makeEnemy('thalassene', 28), 'api-test', {
    recordEvents: false,
  });
  return toCoachRequest(s, summarizeCombatLog(log));
}

export function recapRequest(overrides: Partial<RecapRequest> = {}): RecapRequest {
  const s = createNewGame({ heroName: 'Aria', classId: 'warrior', playerSeed: 'api-recap' });
  const r = computeOfflineProgress(s, 0, 6 * 3600_000);
  return {
    locale: 'fr',
    heroName: 'Aria',
    region: 'forest',
    companions: ['pip'],
    tone: 'epic',
    events: r.events,
    kills: r.rewards.kills,
    elapsedMs: 6 * 3600_000,
    ...overrides,
  };
}

export const GOOD_STORY =
  'Pendant ton absence, Aria a parcouru Bois-Murmure sous les arbres-lanternes. ' +
  'Elle a affronté des loups de mousse et des sylphes épineuses, gagnant en force à chaque combat. ' +
  'Pip, le feu follet bavard, prétendait connaître chaque sentier, ce qui leur a valu quelques détours. ' +
  'Au crépuscule, la Mère-Ronce a fini par plier devant sa lame, et la route du volcan s’est ouverte. ' +
  'Une graine-lanterne brille désormais dans sa besace, promesse de nouvelles aventures.';

type Responder = (req: LlmRequest<unknown>) => Promise<LlmResult<unknown>> | LlmResult<unknown>;

export class FakeLlm implements LlmClient {
  calls: LlmRequest<unknown>[] = [];
  constructor(private responder: Responder) {}
  async generate<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
    this.calls.push(req as LlmRequest<unknown>);
    return (await this.responder(req as LlmRequest<unknown>)) as LlmResult<T>;
  }
}

export const usage = {
  inputTokens: 1200,
  outputTokens: 300,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
};

export function ok<T>(data: T): LlmResult<T> {
  return { data, usage, stopReason: 'end_turn', servedModel: 'fake' };
}
