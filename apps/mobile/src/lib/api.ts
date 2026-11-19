import type {
  CoachRequest,
  CoachResponse,
  RecapRequest,
  RecapResponse,
} from '@brumeterre/game-core';

/**
 * Client du backend. Aucun secret ici : l'app s'authentifie avec un jeton device
 * anonyme délivré par l'API. Toute erreur est remontée à l'appelant, qui bascule
 * sur les fallbacks locaux.
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
  ) {
    super(`api_error_${status}_${code}`);
  }
}

export interface TokenStore {
  get(): Promise<string | null>;
  set(token: string): Promise<void>;
}

export interface ApiClientOptions {
  baseUrl: string;
  deviceId: string;
  tokens: TokenStore;
  fetchImpl?: typeof fetch;
}

export class ApiClient {
  private fetchImpl: typeof fetch;

  constructor(private opts: ApiClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  coach(body: CoachRequest, timeoutMs: number): Promise<CoachResponse> {
    return this.authedPost<CoachResponse>('/ai/coach', body, timeoutMs);
  }

  recap(body: RecapRequest, timeoutMs: number): Promise<RecapResponse> {
    return this.authedPost<RecapResponse>('/ai/recap', body, timeoutMs);
  }

  private async token(timeoutMs: number): Promise<string> {
    const cached = await this.opts.tokens.get();
    if (cached) return cached;
    const res = await this.post<{ token: string }>(
      '/auth/device',
      { deviceId: this.opts.deviceId },
      timeoutMs,
    );
    await this.opts.tokens.set(res.token);
    return res.token;
  }

  private async authedPost<T>(path: string, body: unknown, timeoutMs: number): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    const token = await this.token(timeoutMs);
    return this.post<T>(path, body, Math.max(1, deadline - Date.now()), token);
  }

  private async post<T>(
    path: string,
    body: unknown,
    timeoutMs: number,
    token?: string,
  ): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await this.fetchImpl(`${this.opts.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(token ? { authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 401) await this.opts.tokens.set('');
        throw new ApiError(res.status, payload.error ?? 'unknown');
      }
      return (await res.json()) as T;
    } finally {
      clearTimeout(timer);
    }
  }
}
