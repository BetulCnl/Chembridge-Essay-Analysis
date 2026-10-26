import type { IndexEntry } from '@chembridge/core';
import { describe, expect, it } from 'vitest';
import {
  applyFilters,
  DEFAULT_FILTERS,
  isoDaysAgo,
  parseFilters,
  serializeFilters,
} from './filters.ts';

function entry(p: Partial<IndexEntry> & Pick<IndexEntry, 'id'>): IndexEntry {
  return {
    title: p.id,
    date: '2026-10-01',
    source: 'arxiv',
    type: 'preprint',
    venue: 'arXiv',
    score: 50,
    chem: [],
    cs: [],
    csInferred: [],
    cells: [],
    code: false,
    data: false,
    bucket: 0,
    ...p,
  };
}

const rows = [
  entry({
    id: 'a',
    chem: ['catalysis'],
    cs: ['gnn'],
    cells: ['catalysis|gnn'],
    score: 80,
    code: true,
    date: '2026-10-20',
  }),
  entry({
    id: 'b',
    chem: ['catalysis', 'energy'],
    csInferred: ['gnn'],
    cells: ['catalysis|gnn', 'energy|gnn'],
    score: 30,
    source: 'rss:nchem',
    type: 'article',
  }),
  entry({
    id: 'c',
    chem: ['energy'],
    cs: ['gnn'],
    cells: ['energy|gnn'],
    score: 60,
    source: 'chemrxiv',
    date: '2026-09-01',
  }),
];

describe('feed filters', () => {
  it('round-trips through the URL and drops defaults', () => {
    const f = {
      ...DEFAULT_FILTERS,
      q: 'mof',
      chem: ['catalysis'],
      cs: ['gnn'],
      inferred: true,
      minScore: 40,
      code: true,
      sort: 'date' as const,
      from: '2026-01-01',
    };
    const sp = serializeFilters(f);
    expect(sp.toString()).toBe(
      'q=mof&from=2026-01-01&chem=catalysis&cs=gnn&inferred=1&min=40&code=1&sort=date',
    );
    expect(parseFilters(sp)).toEqual(f);
    expect(serializeFilters(DEFAULT_FILTERS).toString()).toBe('');
  });

  it('ignores malformed parameters', () => {
    const f = parseFilters(
      new URLSearchParams('from=yesterday&min=999&type=video,news&sort=random'),
    );
    expect(f).toMatchObject({ from: '', minScore: 100, types: ['news'], sort: 'score' });
  });

  it('matches matrix cells exactly, with or without potential cells', () => {
    const cell = { ...DEFAULT_FILTERS, chem: ['catalysis'], cs: ['gnn'] };
    expect(applyFilters(rows, cell).map((r) => r.id)).toEqual(['a']);
    expect(applyFilters(rows, { ...cell, inferred: true }).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('keeps only work that has not tried the method yet', () => {
    const untried = { ...DEFAULT_FILTERS, untried: true };
    expect(applyFilters(rows, { ...untried, cs: ['gnn'] }).map((r) => r.id)).toEqual(['b']);
    expect(
      applyFilters(rows, { ...untried, chem: ['catalysis'], cs: ['gnn'] }).map((r) => r.id),
    ).toEqual(['b']);
    expect(applyFilters(rows, untried).map((r) => r.id)).toEqual(['b']);
    expect(parseFilters(serializeFilters(untried)).untried).toBe(true);
  });

  it('filters by source group, type, score, code and date, and sorts', () => {
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, sources: ['rss'] }).map((r) => r.id)).toEqual([
      'b',
    ]);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, types: ['article'] }).map((r) => r.id)).toEqual(
      ['b'],
    );
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, minScore: 55 }).map((r) => r.id)).toEqual([
      'a',
      'c',
    ]);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, code: true }).map((r) => r.id)).toEqual(['a']);
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, from: '2026-09-15' }).map((r) => r.id)).toEqual(
      ['a', 'b'],
    );
    expect(applyFilters(rows, { ...DEFAULT_FILTERS, sort: 'date' }).map((r) => r.id)).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('restricts to search hits and orders by relevance', () => {
    const hits = new Map([
      ['c', 9],
      ['a', 2],
    ]);
    expect(
      applyFilters(rows, { ...DEFAULT_FILTERS, q: 'x', sort: 'relevance' }, hits).map((r) => r.id),
    ).toEqual(['c', 'a']);
  });

  it('computes date presets in UTC', () => {
    expect(isoDaysAgo(7, new Date('2026-10-24T23:30:00Z'))).toBe('2026-10-17');
  });
});
