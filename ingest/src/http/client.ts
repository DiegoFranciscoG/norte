export interface HostPolicy {
  minIntervalMs: number;
  maxRequestsPerRun: number;
  timeoutMs: number;
  maxRetries: number;
  backoffBaseMs: number;
  backoffMaxMs: number;
}

export interface CacheEntry {
  etag?: string;
  lastModified?: string;
  body: string;
}

export interface HttpCache {
  get(url: string): CacheEntry | undefined;
  set(url: string, entry: CacheEntry): void;
}

export interface HttpResponse {
  status: number;
  body: string;
  fromCache: boolean;
}

export interface HostStats {
  requests: number;
  retries: number;
  waitedMs: number;
  notModified: number;
}

export class BudgetExceededError extends Error {
  constructor(readonly host: string, readonly budget: number) {
    super(`Presupuesto de ${budget} peticiones agotado para ${host}`);
    this.name = 'BudgetExceededError';
  }
}

export class HttpError extends Error {
  constructor(readonly url: string, readonly status: number, message?: string) {
    super(message ?? `HTTP ${status} en ${url}`);
    this.name = 'HttpError';
  }
}

export interface HttpClientOptions {
  policies: Record<string, Partial<HostPolicy>>;
  userAgent: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  random?: () => number;
  cache?: HttpCache;
  /** Tope de espera por Retry-After: si la fuente pide más, se abandona en vez de bloquear la ejecución. */
  maxRetryAfterMs?: number;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

const DEFAULT_POLICY: HostPolicy = {
  minIntervalMs: 1000,
  maxRequestsPerRun: 40,
  timeoutMs: 20000,
  maxRetries: 3,
  backoffBaseMs: 1000,
  backoffMaxMs: 30000,
};

/**
 * Cliente HTTP educado: una cola por host, intervalo mínimo, presupuesto por ejecución, tiempo de espera,
 * reintentos con espera exponencial y jitter, respeto de Retry-After y de X-RateLimit-*, y caché por ETag.
 */
export class HttpClient {
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly lastRequestAt = new Map<string, number>();
  private readonly blockedUntil = new Map<string, number>();
  private readonly hostStats = new Map<string, HostStats>();

  constructor(private readonly opts: HttpClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
  }

  policyFor(host: string): HostPolicy {
    const base = { ...DEFAULT_POLICY, ...this.opts.policies['default'] };
    const exact = this.opts.policies[host];
    if (exact) return { ...base, ...exact };
    const wildcard = Object.entries(this.opts.policies).find(([pattern]) => pattern.startsWith('*.') && host.endsWith(pattern.slice(1)));
    return wildcard ? { ...base, ...wildcard[1] } : base;
  }

  /** Para hosts comodín (*.recruitee.com) el presupuesto y el ritmo se comparten entre subdominios. */
  private bucketFor(host: string): string {
    const wildcard = Object.keys(this.opts.policies).find((p) => p.startsWith('*.') && host.endsWith(p.slice(1)));
    return wildcard ?? host;
  }

  stats(): Record<string, HostStats> {
    return Object.fromEntries(this.hostStats);
  }

  async get(url: string, accept = 'application/json'): Promise<HttpResponse> {
    const host = new URL(url).host;
    const bucket = this.bucketFor(host);
    const previous = this.queues.get(bucket) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.perform(url, host, bucket, accept));
    this.queues.set(bucket, run);
    return run;
  }

  private stat(bucket: string): HostStats {
    let s = this.hostStats.get(bucket);
    if (!s) {
      s = { requests: 0, retries: 0, waitedMs: 0, notModified: 0 };
      this.hostStats.set(bucket, s);
    }
    return s;
  }

  private async waitTurn(bucket: string, policy: HostPolicy): Promise<void> {
    const stats = this.stat(bucket);
    const last = this.lastRequestAt.get(bucket);
    const earliest = Math.max(last === undefined ? 0 : last + policy.minIntervalMs, this.blockedUntil.get(bucket) ?? 0);
    const wait = earliest - this.now();
    if (wait > 0) {
      stats.waitedMs += wait;
      await this.sleep(wait);
    }
  }

  private async perform(url: string, host: string, bucket: string, accept: string): Promise<HttpResponse> {
    const policy = this.policyFor(host);
    const stats = this.stat(bucket);
    const cached = this.opts.cache?.get(url);
    let attempt = 0;
    for (;;) {
      if (stats.requests >= policy.maxRequestsPerRun) throw new BudgetExceededError(bucket, policy.maxRequestsPerRun);
      await this.waitTurn(bucket, policy);
      stats.requests++;
      this.lastRequestAt.set(bucket, this.now());

      const headers: Record<string, string> = { 'User-Agent': this.opts.userAgent, Accept: accept };
      if (cached?.etag) headers['If-None-Match'] = cached.etag;
      if (cached?.lastModified) headers['If-Modified-Since'] = cached.lastModified;

      let status: number;
      let body = '';
      let responseHeaders: Headers | null = null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), policy.timeoutMs);
      try {
        const res = await this.fetchImpl(url, { headers, signal: controller.signal, redirect: 'follow' });
        status = res.status;
        responseHeaders = res.headers;
        body = status === 304 ? '' : await res.text();
        if (status === 200 && body.startsWith('error code: 1015')) status = 429;
      } catch (err) {
        status = -1;
        body = err instanceof Error ? err.message : String(err);
      } finally {
        clearTimeout(timer);
      }

      if (responseHeaders) this.applyRateLimitHeaders(bucket, responseHeaders);

      if (status === 304 && cached) {
        stats.notModified++;
        return { status: 200, body: cached.body, fromCache: true };
      }
      if (status >= 200 && status < 300) {
        const etag = responseHeaders?.get('etag') ?? undefined;
        const lastModified = responseHeaders?.get('last-modified') ?? undefined;
        if (this.opts.cache && (etag || lastModified)) this.opts.cache.set(url, { etag, lastModified, body });
        return { status, body, fromCache: false };
      }
      const retryable = status === -1 || RETRYABLE.has(status);
      if (!retryable || attempt >= policy.maxRetries) {
        throw new HttpError(url, status, status === -1 ? `Fallo de red o tiempo agotado en ${url}: ${body}` : undefined);
      }
      const retryAfter = responseHeaders ? parseRetryAfter(responseHeaders.get('retry-after'), this.now()) : null;
      const maxRetryAfter = this.opts.maxRetryAfterMs ?? 120000;
      if (retryAfter !== null && retryAfter > maxRetryAfter) {
        throw new HttpError(url, status, `${host} pide esperar ${Math.round(retryAfter / 1000)} s: se abandona esta fuente en esta ejecución`);
      }
      const backoff = Math.min(policy.backoffMaxMs, policy.backoffBaseMs * 2 ** attempt) + Math.floor(this.random() * policy.backoffBaseMs);
      const delay = Math.max(backoff, retryAfter ?? 0);
      this.blockedUntil.set(bucket, this.now() + delay);
      stats.retries++;
      attempt++;
    }
  }

  private applyRateLimitHeaders(bucket: string, headers: Headers): void {
    const remaining = headers.get('x-ratelimit-remaining');
    const reset = headers.get('x-ratelimit-reset');
    if (remaining !== null && Number(remaining) <= 0 && reset !== null) {
      const value = Number(reset);
      if (Number.isFinite(value)) {
        const until = value > 1e12 ? value : value > 1e9 ? value * 1000 : this.now() + value * 1000;
        this.blockedUntil.set(bucket, Math.max(this.blockedUntil.get(bucket) ?? 0, until));
      }
    }
  }
}

export function parseRetryAfter(value: string | null, now: number): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}
