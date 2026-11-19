import {
  buildLocalRecap,
  type CoachAdvice,
  type CoachResponse,
  type Recap,
  type RecapResponse,
} from '@brumeterre/game-core';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { AiService } from './ai';
import { signDeviceToken, verifyDeviceToken, DEVICE_ID_PATTERN } from './auth';
import type { Env } from './env';
import {
  hashInput,
  MemoryCache,
  MemoryQuotaStore,
  quotaKey,
  type QuotaStore,
  type ResponseCache,
} from './limits';
import type { LlmClient } from './llm';
import { COACH_PROMPT_VERSION } from './prompts/coach.v1';
import { RECAP_PROMPT_VERSION } from './prompts/recap.v1';
import { CoachRequestSchema, DeviceAuthSchema, RecapRequestSchema } from './schemas';

export interface AppDeps {
  env: Env;
  llm: LlmClient;
  quota?: QuotaStore;
  cache?: ResponseCache;
  now?: () => number;
  logger?: boolean;
}

export function buildApp(deps: AppDeps): FastifyInstance {
  const { env, llm } = deps;
  const now = deps.now ?? Date.now;
  const quota = deps.quota ?? new MemoryQuotaStore();
  const cache = deps.cache ?? new MemoryCache(env.CACHE_TTL_MS);
  const app = Fastify({
    logger: deps.logger === false ? false : { level: env.LOG_LEVEL },
    bodyLimit: 64 * 1024,
  });
  const ai = new AiService(llm, env, (entry) => app.log.info({ event: 'ai_call', ...entry }), now);

  const authenticate = (req: FastifyRequest): string | null => {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    return verifyDeviceToken(token, env.DEVICE_TOKEN_SECRET);
  };

  app.get('/health', async () => ({ ok: true }));

  app.post('/auth/device', async (req, reply) => {
    const body = DeviceAuthSchema.safeParse(req.body);
    if (!body.success || !DEVICE_ID_PATTERN.test(body.data.deviceId)) {
      return reply.code(400).send({ error: 'invalid_device_id' });
    }
    return { token: signDeviceToken(body.data.deviceId, env.DEVICE_TOKEN_SECRET) };
  });

  app.post('/ai/coach', async (req, reply) => {
    const userId = authenticate(req);
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = CoachRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const input = parsed.data;
    const key = quotaKey(userId, 'coach', now());

    const cacheKey = hashInput(COACH_PROMPT_VERSION, input);
    const cached = cache.get<CoachAdvice>(cacheKey);
    if (cached) {
      const res: CoachResponse = {
        advice: cached,
        source: 'cache',
        promptVersion: COACH_PROMPT_VERSION,
        remaining: quota.remaining(key, env.COACH_DAILY_LIMIT),
      };
      return res;
    }

    const remaining = quota.consume(key, env.COACH_DAILY_LIMIT);
    if (remaining === null) return reply.code(429).send({ error: 'quota_exceeded' });

    const advice = await ai.coach(input);
    if (!advice) {
      quota.refund(key);
      return reply.code(503).send({ error: 'ai_unavailable' });
    }
    cache.set(cacheKey, advice);
    const res: CoachResponse = {
      advice,
      source: 'ai',
      promptVersion: COACH_PROMPT_VERSION,
      remaining,
    };
    return res;
  });

  app.post('/ai/recap', async (req, reply) => {
    const userId = authenticate(req);
    if (!userId) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = RecapRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_request' });
    const input = parsed.data;
    const key = quotaKey(userId, 'recap', now());

    const cacheKey = hashInput(RECAP_PROMPT_VERSION, input);
    const cached = cache.get<Recap>(cacheKey);
    if (cached) {
      const res: RecapResponse = {
        recap: cached,
        promptVersion: RECAP_PROMPT_VERSION,
        remaining: quota.remaining(key, env.RECAP_DAILY_LIMIT),
      };
      return res;
    }

    const remaining = quota.consume(key, env.RECAP_DAILY_LIMIT);
    // Quota atteint : le jeu ne bloque jamais, on renvoie le récap par templates.
    const recap = remaining === null ? buildLocalRecap(input) : await ai.recap(input);
    if (recap.source === 'ai') cache.set(cacheKey, recap);
    else if (remaining !== null) quota.refund(key); // l'IA n'a pas servi : on rend l'unité
    const res: RecapResponse = {
      recap,
      promptVersion: RECAP_PROMPT_VERSION,
      remaining: remaining ?? 0,
    };
    return res;
  });

  return app;
}
