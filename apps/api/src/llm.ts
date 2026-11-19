import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';

export type Effort = 'low' | 'medium' | 'high';

export interface LlmRequest<T> {
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  maxTokens: number;
  effort: Effort;
  timeoutMs: number;
  maxRetries: number;
}

export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface LlmResult<T> {
  /** null si la sortie est absente, refusée ou invalide (→ fallback). */
  data: T | null;
  usage: LlmUsage;
  stopReason: string | null;
  servedModel: string;
}

export interface LlmClient {
  generate<T>(req: LlmRequest<T>): Promise<LlmResult<T>>;
}

/** Prix en $ par million de tokens (entrée, sortie, lecture cache). */
const PRICING: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
};

export function estimateCostUsd(model: string, usage: LlmUsage): number | null {
  const p = PRICING[model];
  if (!p) return null;
  const cost =
    (usage.inputTokens * p.input +
      usage.cacheWriteTokens * p.input * 1.25 +
      usage.cacheReadTokens * p.cacheRead +
      usage.outputTokens * p.output) /
    1_000_000;
  return Math.round(cost * 1_000_000) / 1_000_000;
}

/** Les modèles qui acceptent le repli serveur en cas de refus (`fallbacks: 'default'`). */
function supportsServerFallback(model: string): boolean {
  return /^claude-(sonnet-5-5|opus-5|fable-5)/.test(model);
}

export class AnthropicLlmClient implements LlmClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate<T>(req: LlmRequest<T>): Promise<LlmResult<T>> {
    const fallback = supportsServerFallback(req.model);
    const response = await this.client.beta.messages.parse(
      {
        model: req.model,
        max_tokens: req.maxTokens,
        // Le prompt système (règles + catalogue) est stable : mis en cache.
        system: [{ type: 'text', text: req.system, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: req.user }],
        output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
        ...(fallback
          ? { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const }
          : {}),
      },
      { timeout: req.timeoutMs, maxRetries: req.maxRetries },
    );
    const usage: LlmUsage = {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    };
    const refused = response.stop_reason === 'refusal' || response.stop_reason === 'max_tokens';
    return {
      data: refused ? null : ((response.parsed_output as T | null) ?? null),
      usage,
      stopReason: response.stop_reason,
      servedModel: response.model,
    };
  }
}

/** Client utilisé quand aucune clé n'est configurée : échoue toujours → fallback. */
export class DisabledLlmClient implements LlmClient {
  async generate<T>(): Promise<LlmResult<T>> {
    throw new Error('AI disabled: ANTHROPIC_API_KEY is not set');
  }
}
