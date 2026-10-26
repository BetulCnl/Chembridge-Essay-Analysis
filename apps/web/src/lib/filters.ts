/**
 * Feed filters, kept in the URL query (`#/?chem=catalysis&cs=gnn&min=30`) so every view is
 * shareable and the matrix can link straight into a filtered feed.
 */
import type { DevelopmentType, IndexEntry } from '@chembridge/core';
import { sourceGroup } from './labels.ts';

export type SortKey = 'score' | 'date' | 'relevance';

export interface FeedFilters {
  q: string;
  from: string;
  to: string;
  sources: string[];
  types: DevelopmentType[];
  chem: string[];
  cs: string[];
  inferred: boolean;
  /**
   * Only work that has not tried the method yet: with methods selected, items where they are
   * potential but unused; with none selected, items that use no CS method at all.
   */
  untried: boolean;
  minScore: number;
  code: boolean;
  data: boolean;
  sort: SortKey;
}

export const DEFAULT_FILTERS: FeedFilters = {
  q: '',
  from: '',
  to: '',
  sources: [],
  types: [],
  chem: [],
  cs: [],
  inferred: false,
  untried: false,
  minScore: 0,
  code: false,
  data: false,
  sort: 'score',
};

const list = (v: string | null) => (v ? v.split(',').filter(Boolean) : []);
const isDate = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');

export function parseFilters(sp: URLSearchParams): FeedFilters {
  const sort = sp.get('sort');
  const min = Number(sp.get('min') ?? 0);
  return {
    q: sp.get('q') ?? '',
    from: isDate(sp.get('from')),
    to: isDate(sp.get('to')),
    sources: list(sp.get('src')),
    types: list(sp.get('type')).filter(
      (t): t is DevelopmentType => t === 'preprint' || t === 'article' || t === 'news',
    ),
    chem: list(sp.get('chem')),
    cs: list(sp.get('cs')),
    inferred: sp.get('inferred') === '1',
    untried: sp.get('untried') === '1',
    minScore: Number.isFinite(min) ? Math.max(0, Math.min(100, min)) : 0,
    code: sp.get('code') === '1',
    data: sp.get('data') === '1',
    sort: sort === 'date' || sort === 'relevance' ? sort : 'score',
  };
}

export function serializeFilters(f: FeedFilters): URLSearchParams {
  const sp = new URLSearchParams();
  if (f.q) sp.set('q', f.q);
  if (f.from) sp.set('from', f.from);
  if (f.to) sp.set('to', f.to);
  if (f.sources.length) sp.set('src', f.sources.join(','));
  if (f.types.length) sp.set('type', f.types.join(','));
  if (f.chem.length) sp.set('chem', f.chem.join(','));
  if (f.cs.length) sp.set('cs', f.cs.join(','));
  if (f.inferred) sp.set('inferred', '1');
  if (f.untried) sp.set('untried', '1');
  if (f.minScore) sp.set('min', String(f.minScore));
  if (f.code) sp.set('code', '1');
  if (f.data) sp.set('data', '1');
  if (f.sort !== 'score') sp.set('sort', f.sort);
  return sp;
}

export function activeFilterCount(f: FeedFilters): number {
  return (
    Number(Boolean(f.from || f.to)) +
    Number(f.sources.length > 0) +
    Number(f.types.length > 0) +
    Number(f.chem.length > 0) +
    Number(f.cs.length > 0) +
    Number(f.untried) +
    Number(f.minScore > 0) +
    Number(f.code) +
    Number(f.data)
  );
}

function matchesCells(e: IndexEntry, f: FeedFilters): boolean {
  const chemSet = new Set(f.chem);
  const csSet = new Set(f.cs);
  const existing = new Set(e.cs);
  return e.cells.some((cell) => {
    const [c, s] = cell.split('|') as [string, string];
    if (!chemSet.has(c) || !csSet.has(s)) return false;
    return f.untried ? !existing.has(s) : f.inferred || existing.has(s);
  });
}

/**
 * Applies the filters. `hits` (id → search score) restricts and, for `relevance`, orders results.
 */
export function applyFilters(
  rows: IndexEntry[],
  f: FeedFilters,
  hits?: Map<string, number>,
): IndexEntry[] {
  const out = rows.filter((e) => {
    if (hits && !hits.has(e.id)) return false;
    if (f.from && e.date < f.from) return false;
    if (f.to && e.date > f.to) return false;
    if (f.sources.length && !f.sources.includes(sourceGroup(e.source))) return false;
    if (f.types.length && !f.types.includes(e.type)) return false;
    if (e.score < f.minScore) return false;
    if (f.code && !e.code) return false;
    if (f.data && !e.data) return false;
    if (f.untried && !f.cs.length && e.cs.length) return false;
    if (f.chem.length && f.cs.length) return matchesCells(e, f);
    if (f.chem.length && !e.chem.some((c) => f.chem.includes(c))) return false;
    if (f.cs.length) {
      const pool = f.untried
        ? e.csInferred.filter((c) => !e.cs.includes(c))
        : f.inferred
          ? [...e.cs, ...e.csInferred]
          : e.cs;
      if (!pool.some((c) => f.cs.includes(c))) return false;
    }
    return true;
  });
  const sort = f.sort === 'relevance' && !hits ? 'score' : f.sort;
  if (sort === 'date') out.sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  else if (sort === 'relevance')
    out.sort((a, b) => (hits!.get(b.id) ?? 0) - (hits!.get(a.id) ?? 0));
  else out.sort((a, b) => b.score - a.score || b.date.localeCompare(a.date));
  return out;
}

export function isoDaysAgo(days: number, now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
