import { describe, expect, it } from 'vitest';
import { analyzeDevelopment } from '@chembridge/core';
import { signalQuery } from '../src/enrich/index.ts';
import {
  compoundCandidates,
  parseGithubSearch,
  parseHn,
  parseOpenAlexWork,
  parsePubChem,
  parseS2Batch,
} from '../src/enrich/sources.ts';
import { buildRss } from '../src/feed.ts';
import { fixture } from './helpers.ts';

describe('enrichment parsers', () => {
  it('reads OpenAlex primary topic hierarchy', () => {
    const t = parseOpenAlexWork(JSON.parse(fixture('openalex.json')))!;
    expect(t.id).toMatch(/^https:\/\/openalex\.org\/W/);
    expect(t.subfield).toBeTruthy();
    expect(t.field).toBeTruthy();
  });

  it('reads PubChem properties', () => {
    const c = parsePubChem(JSON.parse(fixture('pubchem.json')), 'lithium iron phosphate')!;
    expect(c).toMatchObject({
      cid: 15320824,
      formula: 'FeLiO4P',
      url: 'https://pubchem.ncbi.nlm.nih.gov/compound/15320824',
    });
    expect(parsePubChem({}, 'x')).toBeUndefined();
  });

  it('reads Semantic Scholar batch results aligned with the request', () => {
    const r = parseS2Batch(JSON.parse(fixture('semanticscholar.json')));
    expect(r).toHaveLength(2);
    expect(r[0]).toMatchObject({ tldr: expect.stringContaining('retrieval'), citationCount: 4210 });
    expect(r[1]).toBeUndefined();
  });

  it('reads GitHub and HN search results', () => {
    const gh = parseGithubSearch(JSON.parse(fixture('github.json')));
    expect(gh.total).toBe(2);
    expect(gh.repos[0]).toMatchObject({ name: 'example-org/retro-planner', stars: 512 });
    expect(gh.repos[1]!.description).toBeUndefined();
    const hn = parseHn(JSON.parse(fixture('hn.json')));
    expect(hn.length).toBeGreaterThan(0);
    expect(hn[0]!.hnUrl).toMatch(/^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/);
  });
});

describe('compoundCandidates', () => {
  it('finds formulas and chemical names but not ordinary words', () => {
    expect(compoundCandidates('Machine learning screening of LiFePO4 and MoS2 cathodes')).toEqual([
      'LiFePO4',
      'MoS2',
    ]);
    expect(
      compoundCandidates('Acetonitrile and toluene as solvents for an online pipeline'),
    ).toEqual(['acetonitrile', 'toluene']);
    expect(compoundCandidates('A DFT and GNN study of the state of the art')).toEqual([]);
    expect(compoundCandidates('CO₂ capture by amine sorbents')).toContain('CO2');
  });
});

describe('signalQuery', () => {
  it('combines the CS technique evidence with a chemistry term', () => {
    const a = analyzeDevelopment({
      title: 'Graph neural networks for catalyst discovery',
      abstract: 'We use graph neural networks to discover catalysts.',
      topics: [],
      venue: 'x',
      keywords: [],
      links: [],
      chemistrySource: true,
    });
    expect(signalQuery(a)).toMatchObject({ csTerm: 'graph neural networks', chemTerm: 'catalyst' });
  });
});

describe('RSS output', () => {
  it('writes a valid RSS 2.0 document with escaped content', () => {
    const xml = buildRss(
      [
        {
          id: 'abc',
          title: 'Catalysts & <GNNs>',
          abstract: 'An "abstract".',
          abstractIsExcerpt: false,
          authors: [],
          publishedAt: '2026-10-20',
          type: 'preprint',
          venue: 'arXiv',
          url: 'https://arxiv.org/abs/2610.00001',
          primarySource: 'arxiv',
          sources: [],
          topics: [],
          keywords: [],
          links: [],
          chemistrySource: true,
          ingestedAt: '',
          score: { total: 70, components: {} as never, reasons: [], rulesVersion: 1 },
          chem: [{ id: 'catalysis', confidence: 3, evidence: [], inferred: false }],
          cs: [{ id: 'gnn', confidence: 14, evidence: [], inferred: false }],
          cells: [{ chem: 'catalysis', cs: 'gnn', weight: 1, inferred: false }],
          problemTypes: [],
          signals: [],
          enrichment: {},
          related: [],
        },
      ],
      {
        siteUrl: 'https://user.github.io/chembridge/',
        generatedAt: new Date('2026-10-24T00:00:00Z'),
        excerptChars: 300,
      },
    );
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain('<title>Catalysts &amp; &lt;GNNs&gt;</title>');
    expect(xml).toContain('<link>https://user.github.io/chembridge/#/item/abc</link>');
    expect(xml).toContain('<category>Catalysis</category>');
    expect(xml).toContain('Suitability 70/100');
    expect(xml).not.toMatch(/<description>[^<]*<p>/);
  });
});
