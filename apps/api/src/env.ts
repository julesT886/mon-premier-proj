import { z } from 'zod';

const EnvSchema = z.object({
  ANTHROPIC_API_KEY: z.string().default(''),
  COACH_MODEL: z.string().default('claude-sonnet-5-5'),
  RECAP_MODEL: z.string().default('claude-haiku-5-5'),
  DEVICE_TOKEN_SECRET: z.string().min(16, 'DEVICE_TOKEN_SECRET must be at least 16 chars'),
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  COACH_DAILY_LIMIT: z.coerce.number().int().nonnegative().default(20),
  RECAP_DAILY_LIMIT: z.coerce.number().int().nonnegative().default(3),
  COACH_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),
  RECAP_TIMEOUT_MS: z.coerce.number().int().positive().default(3_500),
  CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(24 * 60 * 60 * 1000),
});

export type Env = z.infer<typeof EnvSchema>;

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  return EnvSchema.parse(source);
}
