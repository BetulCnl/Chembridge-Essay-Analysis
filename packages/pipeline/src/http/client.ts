import { ConditionalCache } from './conditionalCache.ts';
import { RateLimiter, realSleep, type Sleep } from './rateLimiter.ts';
import { RobotsChecker } from './robots.ts';
import type { Logger } from '../log.ts';
import { silentLogger } from '../log.ts';

export interface RequestPolicy {
  /** Minimum gap between request starts on this host. */
  minIntervalMs: number;
  timeoutMs: number;
  /** Retries after the first attempt, for network errors, timeouts, 429 and 5xx. */
  retries: number;
  /** A Retry-After longer than this aborts instead of waiting (e.g. OpenAlex daily budget). */
  maxRetryAfterMs?: number;
}

export interface RequestOptions {
  source: string;
  policy: RequestPolicy;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  /** Send If-None-Match / If-Modified-Since and stage the new validators for `source`. */
  conditional?: boolean;
  /** Check robots.txt before fetching (web resources such as RSS feeds). */
  robots?: boolean;
  /** Statuses that are a valid answer rather than an error (e.g. 404 "not found" lookups). */
  acceptStatuses?: number[];
}

export interface HttpResponse {
  status: number;
  url: string;
  headers: Headers;
  text: string;
  notModified: boolean;
}

export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number | undefined,
    readonly url: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class RobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = 'RobotsDisallowedError';
  }
}

/** Raised when a site answers with an anti-bot challenge; we never try to get around those. */
export class BotChallengeError extends HttpError {
  constructor(url: string, status: number) {
    super(`bot-protection challenge (${status}) at ${url}`, status, url);
    this.name = 'BotChallengeError';
  }
}

export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  userAgent: string;
  cache?: ConditionalCache;
  robotsCachePath?: string;
  fetchFn?: FetchFn;
  sleep?: Sleep;
  now?: () => number;
  log?: Logger;
  /** Called for every successful response; used to persist raw payloads. */
  onResponse?: (source: string, res: HttpResponse) => void;
}

const RETRYABLE = new Set([408, 425, 429, 500, 502, 503, 504]);

export class HttpClient {
  readonly cache: ConditionalCache;
  readonly robots: RobotsChecker;
  private readonly limiter: RateLimiter;
  private readonly fetchFn: FetchFn;
  private readonly sleep: Sleep;
  private readonly log: Logger;
  private readonly counts = new Map<string, number>();

  constructor(private readonly opts: HttpClientOptions) {
    this.cache = opts.cache ?? new ConditionalCache();
    this.fetchFn = opts.fetchFn ?? ((input, init) => fetch(input, init));
    this.sleep = opts.sleep ?? realSleep;
    this.limiter = new RateLimiter(opts.now ?? Date.now, this.sleep);
    this.log = opts.log ?? silentLogger;
    this.robots = new RobotsChecker(
      async (url) => {
        const res = await this.request(url, {
          source: 'robots',
          policy: { minIntervalMs: 1000, timeoutMs: 15000, retries: 1 },
          acceptStatuses: [401, 403, 404, 410],
        });
        return { status: res.status, text: res.text };
      },
      'ChemBridge',
      opts.robotsCachePath,
      opts.now,
    );
  }

  /** Number of HTTP requests sent on behalf of `source` (including retries). */
  requestCount(source: string): number {
    return this.counts.get(source) ?? 0;
  }

  async get(url: string, options: RequestOptions): Promise<HttpResponse> {
    return this.request(url, { ...options, method: 'GET' });
  }

  async getJson<T>(
    url: string,
    options: RequestOptions,
  ): Promise<{ data: T | undefined; res: HttpResponse }> {
    const res = await this.get(url, {
      ...options,
      headers: { Accept: 'application/json', ...options.headers },
    });
    if (res.notModified || res.status >= 400) return { data: undefined, res };
    try {
      return { data: JSON.parse(res.text) as T, res };
    } catch {
      throw new HttpError(`invalid JSON from ${url}`, res.status, url);
    }
  }

  async request(url: string, options: RequestOptions): Promise<HttpResponse> {
    if (options.robots && !(await this.robots.allowed(url))) throw new RobotsDisallowedError(url);
    const host = new URL(url).host;
    const { policy } = options;
    let attempt = 0;
    for (;;) {
      try {
        return await this.limiter.schedule(host, policy.minIntervalMs, () =>
          this.once(url, options),
        );
      } catch (err) {
        const retryable =
          err instanceof HttpError
            ? !(err instanceof BotChallengeError) &&
              (err.status === undefined || RETRYABLE.has(err.status))
            : true;
        if (!retryable || attempt >= policy.retries) throw err;
        const retryAfter = err instanceof HttpError ? err.retryAfterMs : undefined;
        if (retryAfter !== undefined && retryAfter > (policy.maxRetryAfterMs ?? 120_000)) throw err;
        const backoff =
          retryAfter ?? Math.min(60_000, 1000 * 2 ** attempt) + Math.floor(Math.random() * 400);
        this.log.warn(`retrying ${options.source}`, {
          url: shorten(url),
          attempt: attempt + 1,
          waitMs: backoff,
          reason: err instanceof Error ? err.message : String(err),
        });
        this.limiter.penalize(host, backoff);
        attempt++;
      }
    }
  }

  private async once(url: string, options: RequestOptions): Promise<HttpResponse> {
    this.counts.set(options.source, (this.counts.get(options.source) ?? 0) + 1);
    const headers: Record<string, string> = {
      'User-Agent': this.opts.userAgent,
      ...options.headers,
    };
    const validators = options.conditional ? this.cache.get(url) : undefined;
    if (validators?.etag) headers['If-None-Match'] = validators.etag;
    if (validators?.lastModified) headers['If-Modified-Since'] = validators.lastModified;

    let res: Response;
    try {
      res = await this.fetchFn(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body,
        redirect: 'follow',
        signal: AbortSignal.timeout(options.policy.timeoutMs),
      });
    } catch (err) {
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      throw new HttpError(`network error: ${reason}`, undefined, url);
    }

    if (res.status === 304) {
      await res.body?.cancel();
      return { status: 304, url, headers: res.headers, text: '', notModified: true };
    }
    const text = await res.text();
    if (isBotChallenge(res, text)) throw new BotChallengeError(url, res.status);
    if (res.status >= 400 && !options.acceptStatuses?.includes(res.status)) {
      throw new HttpError(
        `HTTP ${res.status} from ${shorten(url)}: ${text.slice(0, 160).replace(/\s+/g, ' ')}`,
        res.status,
        url,
        parseRetryAfter(res.headers.get('retry-after'), Date.now()),
      );
    }
    const out: HttpResponse = {
      status: res.status,
      url,
      headers: res.headers,
      text,
      notModified: false,
    };
    if (options.conditional && res.status < 300) {
      const etag = res.headers.get('etag') ?? undefined;
      const lastModified = res.headers.get('last-modified') ?? undefined;
      if (etag || lastModified) {
        this.cache.stage(options.source, url, {
          ...(etag ? { etag } : {}),
          ...(lastModified ? { lastModified } : {}),
          savedAt: new Date().toISOString(),
        });
      }
    }
    if (res.status < 300) this.opts.onResponse?.(options.source, out);
    return out;
  }
}

export function parseRetryAfter(value: string | null, now: number): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

function isBotChallenge(res: Response, text: string): boolean {
  if (res.headers.get('cf-mitigated') === 'challenge') return true;
  if (res.status !== 403 && res.status !== 405 && res.status !== 503) return false;
  const head = text.slice(0, 2000);
  return (
    /<title>(Just a moment|Attention Required|Human Verification)/i.test(head) ||
    /awsWafCookieDomainList/.test(head)
  );
}

function shorten(url: string): string {
  return url.length > 140 ? url.slice(0, 137) + '...' : url;
}
