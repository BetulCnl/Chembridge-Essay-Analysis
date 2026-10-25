/**
 * Loads the static JSON written by the pipeline (`/data/*`). Each file is fetched once per page
 * load and shared through module-level promises.
 */
import { useEffect, useState } from 'react';
import type { DetailEntry, IndexEntry, Meta, Trends, WeeklyDigest } from '@chembridge/core';

export interface SearchDoc {
  id: string;
  title: string;
  keywords: string;
  authors: string;
  text: string;
}

export interface WeekRef {
  week: string;
  from: string;
  to: string;
  total: number;
}

export class NoDataError extends Error {
  constructor() {
    super('no data');
    this.name = 'NoDataError';
  }
}

const base = `${import.meta.env.BASE_URL ?? './'}data/`;
const cache = new Map<string, Promise<unknown>>();

export function dataUrl(path: string): string {
  return base + path;
}

function load<T>(path: string): Promise<T> {
  let p = cache.get(path) as Promise<T> | undefined;
  if (!p) {
    p = fetch(dataUrl(path)).then(async (r) => {
      if (r.status === 404) throw new NoDataError();
      if (!r.ok) throw new Error(`HTTP ${r.status} for ${path}`);
      const type = r.headers.get('content-type') ?? '';
      // Static hosts answer unknown paths of an SPA with index.html.
      if (type.includes('text/html')) throw new NoDataError();
      return (await r.json()) as T;
    });
    p.catch(() => cache.delete(path));
    cache.set(path, p);
  }
  return p;
}

export const loadMeta = () => load<Meta>('meta.json');
export const loadIndex = () => load<IndexEntry[]>('index.json');
export const loadTrends = () => load<Trends>('trends.json');
export const loadSearchDocs = () => load<SearchDoc[]>('search.json');
export const loadWeeks = () => load<WeekRef[]>('weekly/index.json');
export const loadWeek = (week: string) => load<WeeklyDigest>(`weekly/${week}.json`);
export const loadBucket = (bucket: number) =>
  load<DetailEntry[]>(`items/${String(bucket).padStart(2, '0')}.json`);

let indexById: Promise<Map<string, IndexEntry>> | undefined;
export function loadIndexById(): Promise<Map<string, IndexEntry>> {
  indexById ??= loadIndex().then((rows) => new Map(rows.map((r) => [r.id, r])));
  indexById.catch(() => (indexById = undefined));
  return indexById;
}

export async function loadDetail(id: string): Promise<DetailEntry | undefined> {
  const byId = await loadIndexById();
  const entry = byId.get(id);
  if (!entry) return undefined;
  const bucket = await loadBucket(entry.bucket);
  return bucket.find((d) => d.id === id);
}

export type AsyncState<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'empty' }
  | { status: 'error'; error: Error };

/**
 * Runs an async loader, re-running when `deps` change; `retry()` forces a reload. The state is
 * keyed by the dependencies, so a stale result is never shown for new deps.
 */
export function useAsync<T>(
  loader: () => Promise<T>,
  deps: Array<string | number | undefined>,
): AsyncState<T> & { retry: () => void } {
  const [nonce, setNonce] = useState(0);
  const key = JSON.stringify([...deps, nonce]);
  const [state, setState] = useState<{ key: string; value: AsyncState<T> }>({
    key: '',
    value: { status: 'loading' },
  });
  useEffect(() => {
    let alive = true;
    loader().then(
      (data) => alive && setState({ key, value: { status: 'ready', data } }),
      (error: unknown) => {
        if (!alive) return;
        if (error instanceof NoDataError) setState({ key, value: { status: 'empty' } });
        else
          setState({
            key,
            value: {
              status: 'error',
              error: error instanceof Error ? error : new Error(String(error)),
            },
          });
      },
    );
    return () => {
      alive = false;
    };
    // `loader` is recreated on every render; `key` captures everything it depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const value: AsyncState<T> = state.key === key ? state.value : { status: 'loading' };
  return { ...value, retry: () => setNonce((n) => n + 1) };
}
