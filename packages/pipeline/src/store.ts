import { existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Development } from '@chembridge/core';
import {
  readJson,
  readJsonl,
  toJsonl,
  writeFileAtomic,
  writeIfChanged,
  writeJson,
} from './fsutil.ts';

export interface SourceCursor {
  lastSuccessTo: string;
  lastRunAt: string;
}

/**
 * Layout of the pipeline's working data (see docs/ARCHITECTURE.md). In CI the directory is a
 * checkout of the `data` branch; locally it defaults to `.data/`.
 */
export class DataStore {
  readonly state: string;
  readonly corpusDir: string;
  readonly rawDir: string;
  readonly publicDir: string;
  readonly enrichDir: string;
  private rawCounters = new Map<string, number>();

  constructor(readonly root: string) {
    this.state = join(root, 'state');
    this.corpusDir = join(this.state, 'corpus');
    this.rawDir = join(root, 'raw');
    this.publicDir = join(root, 'public');
    this.enrichDir = join(this.state, 'enrich');
    for (const d of [this.state, this.corpusDir, this.rawDir, this.publicDir, this.enrichDir])
      mkdirSync(d, { recursive: true });
  }

  path(...parts: string[]): string {
    return join(this.state, ...parts);
  }

  loadCorpus(): Development[] {
    const out: Development[] = [];
    for (const file of walk(this.corpusDir))
      if (file.endsWith('.jsonl')) out.push(...readJsonl<Development>(file));
    return out;
  }

  /** Writes the corpus partitioned by publication day; only changed partitions touch the disk. */
  saveCorpus(records: Development[]): { written: number; removed: number } {
    const parts = new Map<string, Development[]>();
    for (const r of records) {
      const [y, m, d] = r.publishedAt.split('-');
      const key = join(y!, m!, `${d}.jsonl`);
      const list = parts.get(key);
      if (list) list.push(r);
      else parts.set(key, [r]);
    }
    let written = 0;
    for (const [key, list] of parts) {
      list.sort((a, b) => a.id.localeCompare(b.id));
      if (writeIfChanged(join(this.corpusDir, key), toJsonl(list))) written++;
    }
    let removed = 0;
    for (const file of walk(this.corpusDir)) {
      if (!file.endsWith('.jsonl')) continue;
      if (!parts.has(relative(this.corpusDir, file))) {
        rmSync(file);
        removed++;
      }
    }
    return { written, removed };
  }

  /** Stores a raw response body, gzip-compressed, under raw/<YYYY-MM-DD>/<source>-NNN.json.gz. */
  saveRaw(day: string, source: string, url: string, status: number, body: string): void {
    const safe = source.replace(/[^a-z0-9-]+/gi, '_');
    const key = `${day}/${safe}`;
    const n = (this.rawCounters.get(key) ?? 0) + 1;
    this.rawCounters.set(key, n);
    const payload = JSON.stringify({
      source,
      url,
      status,
      savedAt: new Date().toISOString(),
      body,
    });
    const file = join(this.rawDir, day, `${safe}-${String(n).padStart(3, '0')}.json.gz`);
    mkdirSync(join(this.rawDir, day), { recursive: true });
    writeFileAtomic(file, gzipSync(payload));
  }

  pruneRaw(today: string, keepDays: number): number {
    if (!existsSync(this.rawDir)) return 0;
    const cutoff = addDays(today, -keepDays);
    let removed = 0;
    for (const day of readdirSync(this.rawDir)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(day) && day < cutoff) {
        rmSync(join(this.rawDir, day), { recursive: true, force: true });
        removed++;
      }
    }
    return removed;
  }

  readCursors(): Record<string, SourceCursor> {
    return readJson(this.path('cursors.json'), {});
  }

  writeCursors(c: Record<string, SourceCursor>): void {
    writeJson(this.path('cursors.json'), c, true);
  }

  readState<T>(name: string, fallback: T): T {
    return readJson(this.path(name), fallback);
  }

  writeState(name: string, value: unknown, pretty = false): void {
    writeJson(this.path(name), value, pretty);
  }
}

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
