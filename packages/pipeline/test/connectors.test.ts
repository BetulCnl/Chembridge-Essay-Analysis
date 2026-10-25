/**
 * Parser tests against real, trimmed API responses recorded with `pnpm pipeline fixtures:record`
 * (2026-10-24). Hand-written fixtures are listed in fixtures/README.md.
 */
import { describe, expect, it } from 'vitest';
import { buildArxivUrl, parseArxivFeed } from '../src/connectors/arxiv.ts';
import { parseBiorxiv, splitBiorxivAuthors } from '../src/connectors/biorxiv.ts';
import { crossrefDate, parseCrossrefWorks } from '../src/connectors/crossref.ts';
import { buildEpmcUrl, parseEpmc } from '../src/connectors/europepmc.ts';
import { cleanFeedLink, parseFeed } from '../src/connectors/rss.ts';
import type { FeedConfig } from '../src/config.ts';
import { finalizeDraft, isCreativeCommons } from '../src/normalize.ts';
import { fixture } from './helpers.ts';

const fetchedAt = '2026-10-24T22:00:00.000Z';

function finalizeAll<T extends Parameters<typeof finalizeDraft>[0]>(drafts: T[]) {
  return drafts.map(finalizeDraft).filter((d): d is NonNullable<typeof d> => Boolean(d));
}

describe('arXiv', () => {
  const page = parseArxivFeed(fixture('arxiv.xml'), {
    fetchedAt,
    sourceUrl: 'https://export.arxiv.org/api/query',
    chemCategories: ['physics.chem-ph', 'cond-mat.mtrl-sci', 'q-bio.BM'],
    csCategories: ['cs.LG', 'cs.AI', 'cs.CE'],
  });

  it('reads totals and entries', () => {
    expect(page.total).toBeGreaterThan(0);
    expect(page.entries).toBe(5);
    expect(page.drafts).toHaveLength(5);
  });

  it('normalizes ids, dates, categories and cross-listing', () => {
    const devs = finalizeAll(page.drafts);
    for (const d of devs) {
      expect(d.arxivId).toMatch(/^\d{4}\.\d{4,5}$/);
      expect(d.url).toBe(`https://arxiv.org/abs/${d.arxivId}`);
      expect(d.publishedAt).toMatch(/^2026-\d{2}-\d{2}$/);
      expect(d.authors.length).toBeGreaterThan(0);
      expect(d.abstractIsExcerpt).toBe(false); // arXiv metadata is CC0
      expect(d.title).not.toMatch(/\s{2,}|\n/);
      // The probe query asks for chemistry AND cs.LG/cs.AI, so every entry is cross-listed.
      expect(d.topics).toContain('arxiv:cross-list:chem-cs');
      expect(d.chemistrySource).toBe(true);
    }
  });

  it('builds a dated query URL', () => {
    const url = buildArxivUrl('cat:physics.chem-ph', '2026-04-27', '2026-10-24', 0, 500);
    expect(decodeURIComponent(url.replaceAll('+', ' '))).toContain(
      'submittedDate:[202604270000 TO 202610242359]',
    );
  });

  it('turns an API error entry into an exception', () => {
    const err = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/api/errors#bad</id><summary>bad query</summary></entry></feed>`;
    expect(() =>
      parseArxivFeed(err, { fetchedAt, sourceUrl: '', chemCategories: [], csCategories: [] }),
    ).toThrow(/bad query/);
  });
});

describe('Crossref (ChemRxiv)', () => {
  const message = JSON.parse(fixture('crossref-chemrxiv.json')).message;
  const drafts = parseCrossrefWorks(message, {
    source: 'chemrxiv',
    sourceUrl: 'x',
    fetchedAt,
    type: 'preprint',
    venueFallback: 'ChemRxiv',
    chemistrySource: true,
  });
  const devs = finalizeAll(drafts);

  it('parses every posted-content record', () => {
    expect(devs).toHaveLength(message.items.length);
  });

  it('drops the version suffix from ChemRxiv DOIs and keeps abstracts as excerpts without a licence', () => {
    for (const d of devs) {
      expect(d.doi).toMatch(/^10\.26434\/chemrxiv\.\d+$/);
      expect(d.type).toBe('preprint');
      expect(d.abstract).not.toMatch(/<jats:/);
      expect(d.abstract.length).toBeLessThanOrEqual(601);
    }
  });

  it('reads Crossref date-parts', () => {
    expect(crossrefDate({ 'date-parts': [[2026, 10, 21]] })).toBe('2026-10-21');
    expect(crossrefDate({ 'date-parts': [[2026, 10]] })).toBe('2026-10-01');
    expect(crossrefDate({ 'date-parts': [[null]] })).toBeUndefined();
  });
});

describe('Crossref (journals)', () => {
  const message = JSON.parse(fixture('crossref-journal.json')).message;
  const devs = finalizeAll(
    parseCrossrefWorks(message, {
      source: 'crossref-journals',
      sourceUrl: 'x',
      fetchedAt,
      type: 'article',
      venueFallback: 'JCIM',
      chemistrySource: true,
    }),
  );

  it('uses the container title as venue', () => {
    expect(devs.length).toBeGreaterThan(0);
    expect(devs.every((d) => d.venue === 'Journal of Chemical Information and Modeling')).toBe(
      true,
    );
  });

  it('stores full abstracts only for Creative Commons records', () => {
    for (const d of devs) {
      if (d.license && isCreativeCommons(d.license)) continue;
      expect(d.abstract.length).toBeLessThanOrEqual(601);
    }
    expect(devs.some((d) => d.license?.includes('creativecommons.org'))).toBe(true);
  });

  it('skips correction notices', () => {
    const drafts = parseCrossrefWorks(
      {
        'total-results': 1,
        items: [
          {
            DOI: '10.1/x',
            title: ['Correction to “Something”'],
            created: { 'date-parts': [[2026, 1, 1]] },
          },
        ],
      },
      {
        source: 's',
        sourceUrl: '',
        fetchedAt,
        type: 'article',
        venueFallback: 'v',
        chemistrySource: true,
      },
    );
    expect(drafts).toEqual([]);
  });
});

describe('RSS / RDF feeds', () => {
  const feed = (id: string, type: 'article' | 'news'): FeedConfig => ({
    id,
    name: id,
    url: `https://x/${id}`,
    type,
    chemistry: true,
  });

  it('parses Nature RSS 1.0 with DOIs and strips the boilerplate prefix', () => {
    const devs = finalizeAll(
      parseFeed(fixture('rss-nchem.xml'), { feed: feed('nchem', 'article'), fetchedAt }),
    );
    expect(devs).toHaveLength(4);
    for (const d of devs) {
      expect(d.doi).toMatch(/^10\.1038\/s41557-/);
      expect(d.abstract).not.toMatch(/Published online/);
      expect(d.authors.length).toBeGreaterThan(0);
      expect(d.type).toBe('article');
    }
  });

  it('parses RSS 2.0 news feeds', () => {
    for (const id of ['physorg-chem', 'sciencedaily-chem', 'cen']) {
      const devs = finalizeAll(
        parseFeed(fixture(`rss-${id}.xml`), { feed: feed(id, 'news'), fetchedAt }),
      );
      expect(devs.length, id).toBe(4);
      for (const d of devs) {
        expect(d.type).toBe('news');
        expect(d.url).toMatch(/^https:\/\//);
        expect(d.abstractIsExcerpt || d.abstract.length <= 600).toBe(true);
      }
    }
  });

  it('removes tracking parameters from links', () => {
    expect(cleanFeedLink('https://cen.acs.org/a/b?sc=230901_cenrssfeed&x=1')).toBe(
      'https://cen.acs.org/a/b?x=1',
    );
  });

  it('parses Atom entries', () => {
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Atom item about catalysts</title>
      <link rel="alternate" href="https://example.org/a"/><updated>2026-10-20T10:00:00Z</updated>
      <summary>Short summary</summary><author><name>Ada L.</name></author></entry></feed>`;
    const [d] = parseFeed(atom, { feed: feed('atom', 'news'), fetchedAt });
    expect(d).toMatchObject({
      url: 'https://example.org/a',
      publishedAt: '2026-10-20',
      title: 'Atom item about catalysts',
    });
  });
});

describe('bioRxiv', () => {
  const res = JSON.parse(fixture('biorxiv.json'));

  it('keeps only first versions and maps licences', () => {
    const drafts = parseBiorxiv(res, 'biorxiv', { sourceUrl: 'x', fetchedAt });
    expect(drafts.every((d) => d.nativeId.endsWith('v1'))).toBe(true);
    expect(drafts.length).toBe(
      res.collection.filter((c: { version: string }) => c.version === '1').length,
    );
    const devs = finalizeAll(drafts);
    expect(devs.every((d) => d.topics[0]?.startsWith('biorxiv:'))).toBe(true);
    expect(isCreativeCommons('cc_by')).toBe(true);
    expect(isCreativeCommons('cc_no')).toBe(false);
  });

  it('filters categories client-side when asked (medRxiv ignores the server filter)', () => {
    expect(
      parseBiorxiv(res, 'medrxiv', { sourceUrl: 'x', fetchedAt, categories: ['epidemiology'] }),
    ).toEqual([]);
  });

  it('formats author names', () => {
    expect(splitBiorxivAuthors('Ghosh, B.; Wang, S.; Zheng, H.')).toEqual([
      'B. Ghosh',
      'S. Wang',
      'H. Zheng',
    ]);
  });
});

describe('Europe PMC', () => {
  const res = JSON.parse(fixture('europepmc.json'));

  it('parses core results and decodes escaped markup in titles', () => {
    const devs = finalizeAll(parseEpmc(res, { sourceUrl: 'x', fetchedAt }));
    expect(devs.length).toBe(res.resultList.result.length);
    expect(devs.some((d) => /&lt;|<sup>/.test(d.title))).toBe(false);
    for (const d of devs) expect(d.url).toMatch(/^https:\/\/(doi\.org|europepmc\.org)\//);
  });

  it('adds the date window to the query', () => {
    const url = buildEpmcUrl('ABSTRACT:catalyst', '2026-04-27', '2026-10-24', 1000, '*');
    expect(new URL(url).searchParams.get('query')).toBe(
      'ABSTRACT:catalyst AND FIRST_PDATE:[2026-04-27 TO 2026-10-24]',
    );
  });
});
