/**
 * Per-key serial scheduler that enforces a minimum interval between request starts.
 * Keys are hostnames, so two sources on the same host (e.g. ChemRxiv-via-Crossref and the
 * Crossref journal connector) share one budget. Concurrency is always 1 per host, which is the
 * strictest limit any of our sources asks for (arXiv: "a single connection at a time").
 */
export type Sleep = (ms: number) => Promise<void>;

export const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class RateLimiter {
  private readonly lastStart = new Map<string, number>();
  private readonly tails = new Map<string, Promise<unknown>>();

  constructor(
    private readonly now: () => number = Date.now,
    private readonly sleep: Sleep = realSleep,
  ) {}

  schedule<T>(key: string, minIntervalMs: number, task: () => Promise<T>): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const run = previous
      .catch(() => undefined)
      .then(async () => {
        const last = this.lastStart.get(key);
        if (last !== undefined) {
          const wait = last + minIntervalMs - this.now();
          if (wait > 0) await this.sleep(wait);
        }
        this.lastStart.set(key, this.now());
        return task();
      });
    this.tails.set(key, run);
    return run;
  }

  /** Pushes the next allowed start of `key` into the future (e.g. after a 429 with Retry-After). */
  penalize(key: string, delayMs: number): void {
    const target = this.now() + delayMs;
    const last = this.lastStart.get(key) ?? 0;
    if (target > last) this.lastStart.set(key, target);
  }
}
