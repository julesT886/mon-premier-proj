import { buildLocalRecap, countWords, type CoachAdvice, type Recap } from '@brumeterre/game-core';
import type { Env } from './env';
import { estimateCostUsd, type LlmClient, type LlmUsage } from './llm';
import { COACH_PROMPT_VERSION, coachSystemPrompt, coachUserPrompt } from './prompts/coach.v1';
import { RECAP_PROMPT_VERSION, recapSystemPrompt, recapUserPrompt } from './prompts/recap.v1';
import {
  CoachOutputSchema,
  RecapOutputSchema,
  sanitizeText,
  type CoachOutput,
  type ValidCoachRequest,
  type ValidRecapRequest,
} from './schemas';

export interface AiCallLog {
  feature: 'coach' | 'recap';
  model: string;
  promptVersion: string;
  latencyMs: number;
  outcome: 'ok' | 'invalid_output' | 'refusal' | 'error' | 'timeout';
  usage?: LlmUsage;
  costUsd?: number | null;
  error?: string;
}

export type Logger = (entry: AiCallLog) => void;

/** Garde au plus `max` phrases. */
export function limitSentences(text: string, max: number): string {
  const parts = text.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [text];
  return parts
    .slice(0, max)
    .map((p) => p.trim())
    .join(' ')
    .trim();
}

/**
 * Post-validation métier de la sortie du coach : on ne fait pas confiance au modèle
 * sur les identifiants. Suggestions invalides retirées, verdict forcé, textes bornés.
 */
export function postValidateCoach(out: CoachOutput, req: ValidCoachRequest): CoachAdvice {
  const available = new Set(req.availableSkills);
  const usedSlots = new Set<number>();
  const suggestions = out.suggestions.filter((s) => {
    if (usedSlots.has(s.changeSlot)) return false;
    if (!available.has(s.to)) return false;
    if (req.build.some((id, slot) => id === s.to && slot !== s.changeSlot)) return false;
    if (req.build[s.changeSlot] === s.to) return false;
    usedSlots.add(s.changeSlot);
    return true;
  });
  return {
    verdict: req.summary.outcome,
    explanation: limitSentences(sanitizeText(out.explanation, 600), 3),
    problems: out.problems
      .slice(0, 4)
      .map((p) => ({ type: p.type, detail: sanitizeText(p.detail, 240) })),
    suggestions: suggestions.map((s) => ({
      changeSlot: s.changeSlot,
      from: req.build[s.changeSlot] ?? null,
      to: s.to,
      expectedImpact: sanitizeText(s.expectedImpact, 160),
    })),
  };
}

export class AiService {
  constructor(
    private llm: LlmClient,
    private env: Pick<Env, 'COACH_MODEL' | 'RECAP_MODEL' | 'COACH_TIMEOUT_MS' | 'RECAP_TIMEOUT_MS'>,
    private log: Logger,
    private clock: () => number = Date.now,
  ) {}

  /** Renvoie null si l'IA échoue : l'appelant répond 503 et l'app bascule sur le coach local. */
  async coach(req: ValidCoachRequest): Promise<CoachAdvice | null> {
    const started = this.clock();
    const base = {
      feature: 'coach' as const,
      model: this.env.COACH_MODEL,
      promptVersion: COACH_PROMPT_VERSION,
    };
    try {
      const res = await this.llm.generate({
        model: this.env.COACH_MODEL,
        system: coachSystemPrompt(req.locale),
        user: coachUserPrompt(req),
        schema: CoachOutputSchema,
        maxTokens: 8000,
        effort: 'medium',
        timeoutMs: this.env.COACH_TIMEOUT_MS,
        maxRetries: 1,
      });
      const latencyMs = this.clock() - started;
      const costUsd = estimateCostUsd(this.env.COACH_MODEL, res.usage);
      if (!res.data) {
        this.log({
          ...base,
          latencyMs,
          usage: res.usage,
          costUsd,
          outcome: res.stopReason === 'refusal' ? 'refusal' : 'invalid_output',
        });
        return null;
      }
      this.log({ ...base, latencyMs, usage: res.usage, costUsd, outcome: 'ok' });
      return postValidateCoach(res.data, req);
    } catch (err) {
      this.log({
        ...base,
        latencyMs: this.clock() - started,
        outcome: 'error',
        error: errorName(err),
      });
      return null;
    }
  }

  /**
   * Ne renvoie jamais d'erreur : si l'IA échoue, dépasse le délai, ou produit un texte
   * hors bornes, on renvoie le récap par templates.
   */
  async recap(req: ValidRecapRequest): Promise<Recap> {
    const started = this.clock();
    const base = {
      feature: 'recap' as const,
      model: this.env.RECAP_MODEL,
      promptVersion: RECAP_PROMPT_VERSION,
    };
    const fallback = () => buildLocalRecap(req);
    try {
      const res = await withTimeout(
        this.llm.generate({
          model: this.env.RECAP_MODEL,
          system: recapSystemPrompt(req.locale),
          user: recapUserPrompt(req),
          schema: RecapOutputSchema,
          maxTokens: 2000,
          effort: 'low',
          timeoutMs: this.env.RECAP_TIMEOUT_MS,
          maxRetries: 0,
        }),
        this.env.RECAP_TIMEOUT_MS,
      );
      const latencyMs = this.clock() - started;
      const costUsd = estimateCostUsd(this.env.RECAP_MODEL, res.usage);
      const story = res.data ? sanitizeText(res.data.story, 1200) : '';
      const hook = res.data ? limitSentences(sanitizeText(res.data.hook, 240), 1) : '';
      const words = countWords(story);
      if (!res.data || words < 45 || words > 130 || hook.length === 0) {
        this.log({
          ...base,
          latencyMs,
          usage: res.usage,
          costUsd,
          outcome: res.stopReason === 'refusal' ? 'refusal' : 'invalid_output',
        });
        return fallback();
      }
      this.log({ ...base, latencyMs, usage: res.usage, costUsd, outcome: 'ok' });
      return { story, hook, source: 'ai' };
    } catch (err) {
      const timeout = err instanceof TimeoutError;
      this.log({
        ...base,
        latencyMs: this.clock() - started,
        outcome: timeout ? 'timeout' : 'error',
        error: errorName(err),
      });
      return fallback();
    }
  }
}

export class TimeoutError extends Error {}

export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(`timeout after ${ms} ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

function errorName(err: unknown): string {
  // Jamais le message complet : il pourrait contenir des données sensibles.
  return err instanceof Error ? err.constructor.name : 'unknown';
}
