import {
  createNewGame,
  heroSnapshot,
  makeEnemy,
  simulateCombat,
  type CoachResponse,
  type GameState,
  type RecapResponse,
} from '@brumeterre/game-core';
import { describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from '../src/lib/api';
import {
  coachTarget,
  fetchCoachWithFallback,
  fetchRecapWithFallback,
  recapInputFrom,
  referenceCombat,
  resume,
  showcaseCombat,
  RECAP_THRESHOLD_MS,
} from '../src/lib/session';

const H = 3600_000;

function game(): GameState {
  return createNewGame({ heroName: 'Aria', classId: 'warrior', playerSeed: 'mobile-test' });
}

function memoryTokens() {
  let token: string | null = null;
  return { get: async () => token, set: async (t: string) => void (token = t || null) };
}

function fakeFetch(handler: (url: string, body: unknown) => { status: number; body: unknown }) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const { status, body } = handler(
      String(url),
      init?.body ? JSON.parse(String(init.body)) : null,
    );
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

describe('resume', () => {
  it('shows the recap only after a meaningful absence', () => {
    const s = game();
    expect(resume(s, 0, RECAP_THRESHOLD_MS - 1).showRecap).toBe(false);
    const long = resume(s, 0, 6 * H);
    expect(long.showRecap).toBe(true);
    expect(long.result.rewards.kills).toBeGreaterThan(0);
  });
});

describe('recap with fallback', () => {
  const s = game();
  const { result } = resume(s, 0, 6 * H);
  const input = recapInputFrom(s, result, 'cozy');

  it('works fully offline (no API configured)', async () => {
    const recap = await fetchRecapWithFallback(null, input, 'fr');
    expect(recap.source).toBe('template');
    expect(recap.story.length).toBeGreaterThan(100);
  });

  it('falls back when the API errors', async () => {
    const api = new ApiClient({
      baseUrl: 'http://api',
      deviceId: 'device_12345678',
      tokens: memoryTokens(),
      fetchImpl: fakeFetch(() => ({ status: 500, body: { error: 'boom' } })),
    });
    expect((await fetchRecapWithFallback(api, input, 'fr')).source).toBe('template');
  });

  it('never waits more than the client timeout', async () => {
    const hanging = vi.fn(
      (_url: string | URL | Request, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    const api = new ApiClient({
      baseUrl: 'http://api',
      deviceId: 'device_12345678',
      tokens: memoryTokens(),
      fetchImpl: hanging,
    });
    const started = Date.now();
    const recap = await fetchRecapWithFallback(api, input, 'fr', 200);
    expect(recap.source).toBe('template');
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it('uses the AI recap when available, authenticating first', async () => {
    const calls: string[] = [];
    const api = new ApiClient({
      baseUrl: 'http://api',
      deviceId: 'device_12345678',
      tokens: memoryTokens(),
      fetchImpl: fakeFetch((url) => {
        calls.push(url);
        if (url.endsWith('/auth/device')) return { status: 200, body: { token: 'tok' } };
        const body: RecapResponse = {
          recap: { story: 'Une histoire.', hook: 'Reviens.', source: 'ai' },
          promptVersion: 'recap.v1',
          remaining: 2,
        };
        return { status: 200, body };
      }),
    });
    expect((await fetchRecapWithFallback(api, input, 'fr')).source).toBe('ai');
    expect(calls).toEqual(['http://api/auth/device', 'http://api/ai/recap']);
  });
});

describe('coach with fallback', () => {
  const s = game();
  s.hero.level = 6;
  const log = simulateCombat(heroSnapshot(s), makeEnemy('bramble_mother', 8), 'coach-mobile');

  it('uses the local coach when offline', async () => {
    const out = await fetchCoachWithFallback(null, s, log, 'fr');
    expect(out.source).toBe('local');
    expect(out.advice.verdict).toBe(log.outcome);
  });

  it('uses the local coach on quota errors (429)', async () => {
    const api = new ApiClient({
      baseUrl: 'http://api',
      deviceId: 'device_12345678',
      tokens: memoryTokens(),
      fetchImpl: fakeFetch((url) =>
        url.endsWith('/auth/device')
          ? { status: 200, body: { token: 'tok' } }
          : { status: 429, body: { error: 'quota_exceeded' } },
      ),
    });
    expect((await fetchCoachWithFallback(api, s, log, 'fr')).source).toBe('local');
  });

  it('returns AI advice when the API answers', async () => {
    const advice: CoachResponse = {
      advice: { verdict: 'loss', explanation: 'Trop lent.', problems: [], suggestions: [] },
      source: 'ai',
      promptVersion: 'coach.v1',
      remaining: 19,
    };
    const api = new ApiClient({
      baseUrl: 'http://api',
      deviceId: 'device_12345678',
      tokens: memoryTokens(),
      fetchImpl: fakeFetch((url) =>
        url.endsWith('/auth/device')
          ? { status: 200, body: { token: 'tok' } }
          : { status: 200, body: advice },
      ),
    });
    const out = await fetchCoachWithFallback(api, s, log, 'fr');
    expect(out).toEqual({ advice: advice.advice, source: 'ai' });
  });
});

describe('api client', () => {
  it('clears the cached token on 401 and surfaces typed errors', async () => {
    const tokens = memoryTokens();
    await tokens.set('stale');
    const api = new ApiClient({
      baseUrl: 'http://api',
      deviceId: 'device_12345678',
      tokens,
      fetchImpl: fakeFetch(() => ({ status: 401, body: { error: 'unauthorized' } })),
    });
    await expect(api.recap({} as never, 500)).rejects.toBeInstanceOf(ApiError);
    expect(await tokens.get()).toBeNull();
  });
});

describe('targets and showcase fights', () => {
  it('targets the boss until it is defeated', () => {
    const s = game();
    expect(coachTarget(s)).toEqual({ kind: 'boss', region: 'forest' });
    s.regions.forest.bossDefeated = true;
    expect(coachTarget(s)).toEqual({ kind: 'region', region: 'forest' });
    const log = referenceCombat(s, 1);
    expect(coachTarget(s, log)).toEqual({
      kind: 'enemy',
      enemyId: log.enemy.enemyId,
      level: log.enemy.level,
    });
  });

  it('showcase fights are deterministic and recorded with events', () => {
    const s = game();
    expect(showcaseCombat(s, 3)).toEqual(showcaseCombat(s, 3));
    expect(showcaseCombat(s, 3).events.length).toBeGreaterThan(0);
  });
});
