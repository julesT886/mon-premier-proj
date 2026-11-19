import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Rate limit quotidien par utilisateur et par fonctionnalité.
// Implémentation mémoire (un seul process) ; l'interface permet de brancher Redis.
// ---------------------------------------------------------------------------

export type Feature = 'coach' | 'recap';

export interface QuotaStore {
  /** Consomme une unité si possible ; renvoie le restant, ou null si le quota est atteint. */
  consume(key: string, limit: number): number | null;
  remaining(key: string, limit: number): number;
  /** Rend une unité consommée (appel IA échoué). */
  refund(key: string): void;
}

export class MemoryQuotaStore implements QuotaStore {
  private counts = new Map<string, number>();

  consume(key: string, limit: number): number | null {
    const used = this.counts.get(key) ?? 0;
    if (used >= limit) return null;
    this.counts.set(key, used + 1);
    this.prune();
    return limit - used - 1;
  }

  remaining(key: string, limit: number): number {
    return Math.max(0, limit - (this.counts.get(key) ?? 0));
  }

  refund(key: string): void {
    const used = this.counts.get(key) ?? 0;
    if (used > 0) this.counts.set(key, used - 1);
  }

  private prune() {
    // Les clés contiennent la date : on purge celles des jours précédents.
    if (this.counts.size < 10_000) return;
    const today = utcDay(Date.now());
    for (const key of this.counts.keys()) if (!key.endsWith(today)) this.counts.delete(key);
  }
}

export function utcDay(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

export function quotaKey(userId: string, feature: Feature, now: number): string {
  return `${feature}:${userId}:${utcDay(now)}`;
}

// ---------------------------------------------------------------------------
// Cache de réponses par hash d'entrée normalisée.
// ---------------------------------------------------------------------------

export interface ResponseCache {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T): void;
}

export class MemoryCache implements ResponseCache {
  private store = new Map<string, { value: unknown; expiresAt: number }>();

  constructor(
    private ttlMs: number,
    private maxEntries = 5000,
    private now: () => number = Date.now,
  ) {}

  get<T>(key: string): T | undefined {
    const hit = this.store.get(key);
    if (!hit) return undefined;
    if (hit.expiresAt <= this.now()) {
      this.store.delete(key);
      return undefined;
    }
    return hit.value as T;
  }

  set<T>(key: string, value: T): void {
    if (this.store.size >= this.maxEntries) {
      const oldest = this.store.keys().next().value;
      if (oldest !== undefined) this.store.delete(oldest);
    }
    this.store.set(key, { value, expiresAt: this.now() + this.ttlMs });
  }
}

/** JSON à clés triées : deux entrées équivalentes ont le même hash. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function hashInput(namespace: string, value: unknown): string {
  return `${namespace}:${createHash('sha256').update(stableStringify(value)).digest('hex')}`;
}
