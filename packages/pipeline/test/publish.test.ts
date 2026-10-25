import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { DetailEntry, IndexEntry, Meta, Trends } from '@chembridge/core';
import { loadConfig } from '../src/config.ts';
import { parseArxivFeed } from '../src/connectors/arxiv.ts';
import { parseCrossrefWorks } from '../src/connectors/crossref.ts';
import { parseEpmc } from '../src/connectors/europepmc.ts';
import { mergeDevelopments } from '../src/dedup.ts';
import { silentLogger } from '../src/log.ts';
import { finalizeDraft } from '../src/normalize.ts';
import { createRuntime } from '../src/runtime.ts';
import { buildAnalysis } from '../src/stages/analyze.ts';
import { publish } from '../src/stages/publish.ts';
import { fixture, tempDir } from './helpers.ts';

function corpusFromFixtures() {
  const fetchedAt = '2026-10-24T22:00:00.000Z';
  const drafts = [
    ...parseArxivFeed(fixture('arxiv.xml'), {
      fetchedAt,
      sourceUrl: 'x',
      chemCategories: ['physics.chem-ph', 'cond-mat.mtrl-sci', 'q-bio.BM'],
      csCategories: ['cs.LG', 'cs.AI'],
    }).drafts,
    ...parseCrossrefWorks(JSON.parse(fixture('crossref-journal.json')).message, {
      source: 'crossref-journals',
      sourceUrl: 'x',
      fetchedAt,
      type: 'article',
      venueFallback: 'JCIM',
      chemistrySource: true,
    }),
    ...parseEpmc(JSON.parse(fixture('europepmc.json')), { sourceUrl: 'x', fetchedAt }),
  ];
  return mergeDevelopments(
    [],
    drafts.map(finalizeDraft).filter((d) => d !== undefined),
  ).records;
}

describe('analyze + publish', () => {
  it('writes schema-valid static data from a corpus without network access', async () => {
    const dataDir = tempDir();
    const config = loadConfig();
    config.embeddings.provider = 'tfidf';
    config.publish.minScore = 10;
    config.publish.buckets = 4;
    for (const k of Object.keys(config.enrich) as Array<keyof typeof config.enrich>)
      config.enrich[k].enabled = false;
    const rt = createRuntime({
      dataDir,
      config,
      now: new Date('2026-10-24T23:00:00Z'),
      log: silentLogger,
      fetchFn: async () => {
        throw new Error('no network in this test');
      },
    });
    rt.store.saveCorpus(corpusFromFixtures());

    const set = await buildAnalysis(rt, { fetch: false });
    expect(set.embeddings).toBe('tfidf-hashed-1024');
    expect(set.published.length).toBeGreaterThan(3);
    const result = await publish(rt, { analysis: set });
    const out = result.outDir;

    for (const f of [
      'meta.json',
      'index.json',
      'search.json',
      'trends.json',
      'feed.xml',
      'weekly/index.json',
    ]) {
      expect(existsSync(join(out, f)), f).toBe(true);
    }
    expect(readdirSync(join(out, 'items')).sort()).toEqual([
      '00.json',
      '01.json',
      '02.json',
      '03.json',
    ]);

    const index = JSON.parse(readFileSync(join(out, 'index.json'), 'utf8')) as IndexEntry[];
    expect(index).toHaveLength(set.published.length);
    expect(index.every((e) => e.score >= 10)).toBe(true);

    const first = index[0]!;
    const bucket = JSON.parse(
      readFileSync(join(out, 'items', `${String(first.bucket).padStart(2, '0')}.json`), 'utf8'),
    ) as DetailEntry[];
    const detail = bucket.find((d) => d.id === first.id)!;
    expect(detail).toBeDefined();
    expect(detail.abstractExcerpt.length).toBeLessThanOrEqual(601);
    expect('abstract' in detail).toBe(false);
    expect(detail.score.reasons.length).toBeGreaterThan(0);

    const meta = JSON.parse(readFileSync(join(out, 'meta.json'), 'utf8')) as Meta;
    expect(meta.counts.published).toBe(index.length);
    const trends = JSON.parse(readFileSync(join(out, 'trends.json'), 'utf8')) as Trends;
    expect(trends.cells.length).toBeGreaterThan(0);
    expect(readFileSync(join(out, 'feed.xml'), 'utf8')).toContain('<rss version="2.0"');
  });
});

describe('assertSafeToClear', () => {
  it('refuses to wipe a foreign non-empty directory', async () => {
    const { assertSafeToClear } = await import('../src/stages/publish.ts');
    const { mkdirSync, writeFileSync } = await import('node:fs');
    const dir = tempDir();
    expect(() => assertSafeToClear(dir, '/nonexistent')).not.toThrow();
    writeFileSync(join(dir, 'important.txt'), 'x');
    expect(() => assertSafeToClear(dir, '/nonexistent')).toThrow(/refusing/);
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'meta.json'), '{}');
    expect(() => assertSafeToClear(dir, '/nonexistent')).not.toThrow();
  });
});
