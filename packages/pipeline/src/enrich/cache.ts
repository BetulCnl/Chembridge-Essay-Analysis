import { readJson, writeJson } from '../fsutil.ts';

export interface CacheEntry<T> {
  at: string;
  /** Absent means a negative result ("looked up, nothing found"). */
  v?: T;
}

/** JSON-file cache with per-entry timestamps, TTL and negative entries. */
export class EnrichCache<T> {
  private data: Record<string, CacheEntry<T>>;
  private dirty = false;

  constructor(
    private readonly path: string,
    private readonly ttlDays: number,
    private readonly now: Date,
  ) {
    this.data = readJson<Record<string, CacheEntry<T>>>(path, {});
  }

  /** `undefined` = not cached or expired; `{ v: undefined }` = cached negative result. */
  lookup(key: string): CacheEntry<T> | undefined {
    const e = this.data[key];
    if (!e) return undefined;
    const ageDays = (this.now.getTime() - Date.parse(e.at)) / 86_400_000;
    return ageDays > this.ttlDays ? undefined : e;
  }

  value(key: string): T | undefined {
    return this.data[key]?.v;
  }

  set(key: string, v: T | undefined): void {
    this.data[key] =
      v === undefined ? { at: this.now.toISOString() } : { at: this.now.toISOString(), v };
    this.dirty = true;
  }

  get size(): number {
    return Object.keys(this.data).length;
  }

  save(): void {
    if (this.dirty) writeJson(this.path, this.data);
    this.dirty = false;
  }
}
