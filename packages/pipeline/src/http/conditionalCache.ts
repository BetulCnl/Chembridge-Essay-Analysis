import { readJson, writeJson } from '../fsutil.ts';

export interface Validators {
  etag?: string;
  lastModified?: string;
  savedAt: string;
}

/**
 * ETag / Last-Modified store. New validators are *staged* per source and only committed after
 * that source's run succeeded; otherwise a crash after a 200 would make the next run receive a
 * 304 and silently lose the items it never stored.
 */
export class ConditionalCache {
  private entries: Record<string, Validators>;
  private readonly staged = new Map<string, Map<string, Validators>>();

  constructor(private readonly path?: string) {
    this.entries = path ? readJson<Record<string, Validators>>(path, {}) : {};
  }

  get(url: string): Validators | undefined {
    return this.entries[url];
  }

  stage(source: string, url: string, v: Validators): void {
    let m = this.staged.get(source);
    if (!m) this.staged.set(source, (m = new Map()));
    m.set(url, v);
  }

  commit(source: string): void {
    const m = this.staged.get(source);
    if (!m) return;
    for (const [url, v] of m) this.entries[url] = v;
    this.staged.delete(source);
  }

  discard(source: string): void {
    this.staged.delete(source);
  }

  save(): void {
    if (this.path) writeJson(this.path, this.entries, true);
  }
}
