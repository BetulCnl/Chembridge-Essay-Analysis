import { developmentId, type Development } from '@chembridge/core';
import { describe, expect, it } from 'vitest';
import { topicPhrases, topicStats } from '../src/stages/topics.ts';

function dev(title: string, abstract: string, publishedAt: string): Development {
  const url = `https://example.org/${encodeURIComponent(title)}`;
  return {
    id: developmentId({ title, url }),
    title,
    abstract,
    abstractIsExcerpt: false,
    authors: ['A. Author'],
    publishedAt,
    type: 'article',
    venue: 'Journal of the American Chemical Society',
    url,
    primarySource: 'crossref-journals',
    sources: [{ source: 'crossref-journals', nativeId: title, url, fetchedAt: publishedAt }],
    topics: [],
    keywords: [],
    links: [],
    chemistrySource: true,
    ingestedAt: `${publishedAt}T00:00:00Z`,
  };
}

describe('topicPhrases', () => {
  it('finds class phrases and folds plurals', () => {
    const p = topicPhrases('Vinylene-linked covalent organic frameworks for efficient catalysis');
    expect(p.has('covalent organic framework')).toBe(true);
    expect(p.has('organic framework')).toBe(true);
    expect([...p].some((x) => x.startsWith('efficient'))).toBe(false);
  });
});

describe('topicStats', () => {
  it('reports growth, CS share and data share per topic', () => {
    const corpus: Development[] = [];
    for (let i = 0; i < 6; i++)
      corpus.push(
        dev(
          `Iron complexes ${i} for photoredox catalysis`,
          'A series of 24 iron complexes gave yields up to 95%.',
          '2026-10-20',
        ),
      );
    for (let i = 0; i < 2; i++)
      corpus.push(
        dev(`Iron complexes ${i + 6} revisited`, 'Synthesis and structure.', '2026-08-20'),
      );
    corpus.push(
      dev(
        'Machine learning on iron complexes',
        'A graph neural network predicts the yield of iron complexes.',
        '2026-10-21',
      ),
    );
    for (let i = 0; i < 4; i++)
      corpus.push(
        dev(`Zeolite membrane ${i}`, 'Gas separation.', i < 2 ? '2026-10-10' : '2026-08-10'),
      );

    const stats = topicStats(corpus, { minDocs: 3 });
    const iron = stats.find((s) => s.phrase === 'iron complex')!;
    expect(iron.docs).toBe(9);
    expect(iron.recent).toBe(7);
    expect(iron.previous).toBe(2);
    expect(iron.growth).toBeGreaterThan(1);
    expect(iron.csShare).toBeCloseTo(1 / 9, 5);
    expect(iron.dataShare).toBeGreaterThan(0.6);
    expect(iron.examples.every((e) => !e.title.startsWith('Machine'))).toBe(true);
  });
});
