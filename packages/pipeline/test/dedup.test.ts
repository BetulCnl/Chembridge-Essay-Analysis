import { describe, expect, it } from 'vitest';
import { developmentId, type Development } from '@chembridge/core';
import { mergeDevelopments } from '../src/dedup.ts';

function dev(p: Partial<Development> & Pick<Development, 'title' | 'primarySource'>): Development {
  const base: Development = {
    id: '',
    title: p.title,
    abstract: p.abstract ?? '',
    abstractIsExcerpt: p.abstractIsExcerpt ?? false,
    authors: p.authors ?? ['A. Author'],
    publishedAt: p.publishedAt ?? '2026-10-01',
    type: p.type ?? 'preprint',
    venue: p.venue ?? p.primarySource,
    url: p.url ?? `https://example.org/${p.primarySource}`,
    primarySource: p.primarySource,
    sources: p.sources ?? [
      {
        source: p.primarySource,
        nativeId: p.title,
        url: 'u',
        fetchedAt: p.ingestedAt ?? '2026-10-02T00:00:00Z',
      },
    ],
    topics: p.topics ?? [],
    keywords: p.keywords ?? [],
    links: p.links ?? [],
    chemistrySource: p.chemistrySource ?? false,
    ingestedAt: p.ingestedAt ?? '2026-10-02T00:00:00Z',
    ...(p.doi ? { doi: p.doi } : {}),
    ...(p.arxivId ? { arxivId: p.arxivId } : {}),
  };
  return {
    ...base,
    id:
      p.id ??
      developmentId({ doi: base.doi, arxivId: base.arxivId, title: base.title, url: base.url }),
  };
}

describe('mergeDevelopments', () => {
  it('merges by DOI across sources and keeps both source refs', () => {
    const a = dev({
      title: 'A study of catalysts by machine learning',
      primarySource: 'chemrxiv',
      doi: '10.26434/chemrxiv.1',
    });
    const b = dev({
      title: 'Different title after peer review!',
      primarySource: 'europepmc',
      doi: '10.26434/chemrxiv.1',
      type: 'article',
    });
    const { records, stats } = mergeDevelopments([], [a, b]);
    expect(records).toHaveLength(1);
    expect(records[0]!.sources.map((s) => s.source)).toEqual(['chemrxiv', 'europepmc']);
    expect(records[0]!.primarySource).toBe('chemrxiv');
    expect(stats).toMatchObject({ added: 1, merged: 1, after: 1 });
  });

  it('links an arXiv preprint and its journal version via the normalized title', () => {
    const pre = dev({
      title: 'Equivariant Graph Networks for Solid Electrolytes',
      primarySource: 'arxiv',
      arxivId: '2605.01234',
      publishedAt: '2026-05-02',
    });
    const pub = dev({
      title: 'Equivariant graph networks for solid electrolytes.',
      primarySource: 'crossref-journals',
      doi: '10.1021/acs.chemmater.6c00001',
      type: 'article',
      publishedAt: '2026-09-20',
      abstract: 'Longer abstract from the journal.',
    });
    const { records } = mergeDevelopments([], [pre, pub]);
    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r.doi).toBe('10.1021/acs.chemmater.6c00001');
    expect(r.arxivId).toBe('2605.01234');
    expect(r.publishedAt).toBe('2026-05-02');
    expect(r.primarySource).toBe('arxiv');
  });

  it('preserves the id of an existing record when a new source joins it', () => {
    const existing = dev({
      title: 'Self-driving lab for perovskite films',
      primarySource: 'rss:nmat',
      doi: '10.1038/s41563-026-1',
      ingestedAt: '2026-10-01T00:00:00Z',
    });
    const incoming = dev({
      title: 'Self-driving lab for perovskite films',
      primarySource: 'crossref-journals',
      doi: '10.1038/s41563-026-1',
      ingestedAt: '2026-10-05T00:00:00Z',
      id: 'other',
    });
    const { records, stats } = mergeDevelopments([existing], [incoming]);
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe(existing.id);
    expect(stats.added).toBe(0);
  });

  it('does not merge different works with short generic titles', () => {
    const a = dev({ title: 'Editorial', primarySource: 'rss:nchem', url: 'https://a' });
    const b = dev({ title: 'Editorial', primarySource: 'rss:nmat', url: 'https://b' });
    expect(mergeDevelopments([], [a, b]).records).toHaveLength(2);
  });

  it('is idempotent', () => {
    const a = dev({
      title: 'Bayesian optimization of flow chemistry yields',
      primarySource: 'arxiv',
      arxivId: '2606.00001',
    });
    const once = mergeDevelopments([], [a]).records;
    const twice = mergeDevelopments(once, [a]).records;
    expect(twice).toEqual(once);
  });
});
