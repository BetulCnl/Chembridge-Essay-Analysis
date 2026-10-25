import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.ts';
import { silentLogger } from '../src/log.ts';
import { createRuntime } from '../src/runtime.ts';
import { collect, computeWindow } from '../src/stages/collect.ts';
import { arxivConnector } from '../src/connectors/arxiv.ts';
import { rssConnector } from '../src/connectors/rss.ts';
import { fakeFetch, fixture, noSleep, tempDir } from './helpers.ts';

function testConfig() {
  const c = loadConfig();
  c.sources.arxiv.queries = c.sources.arxiv.queries.slice(0, 1);
  c.sources.rss.feeds = c.sources.rss.feeds.filter(
    (f) => f.id === 'nchem' || f.id === 'physorg-chem',
  );
  return c;
}

function routes() {
  return fakeFetch([
    {
      match: (u) => u.endsWith('/robots.txt'),
      respond: () => new Response('User-agent: *\nDisallow: /search'),
    },
    {
      match: (u) => u.startsWith('https://export.arxiv.org/api/query'),
      respond: () => new Response(fixture('arxiv.xml')),
    },
    {
      match: (u) => u.startsWith('https://api.crossref.org/prefixes/10.26434/works'),
      respond: (u) => {
        // Second page (cursor != *) is empty, which ends pagination.
        const cursor = new URL(u).searchParams.get('cursor');
        const body =
          cursor === '*'
            ? fixture('crossref-chemrxiv.json')
            : '{"status":"ok","message":{"total-results":5,"items":[]}}';
        return new Response(body, { headers: { 'content-type': 'application/json' } });
      },
    },
    {
      match: (u) => u === 'https://www.nature.com/nchem.rss',
      respond: (_u, init) =>
        (init.headers as Record<string, string>)['If-None-Match'] === '"nchem-1"'
          ? new Response(null, { status: 304 })
          : new Response(fixture('rss-nchem.xml'), { headers: { ETag: '"nchem-1"' } }),
    },
    {
      match: (u) => u.startsWith('https://phys.org/rss-feed/'),
      respond: () => new Response(fixture('rss-physorg-chem.xml')),
    },
  ]);
}

describe('collect stage', () => {
  it('fetches, normalizes, dedups and persists the corpus, raw payloads, cursors and validators', async () => {
    const dataDir = tempDir();
    const fetchFn = routes();
    const now = new Date('2026-10-24T23:00:00Z');
    const rt = createRuntime({
      dataDir,
      now,
      fetchFn,
      config: testConfig(),
      log: silentLogger,
      sleep: noSleep,
    });
    // The arXiv fixture has 114 total results but only 5 entries; make the page size match so
    // pagination stops after one page.
    rt.config.sources.arxiv.pageSize = 5;
    const first = await collect(rt, { sources: ['arxiv', 'chemrxiv', 'rss'] });

    expect(first.reports.map((r) => [r.source, r.ok])).toEqual([
      ['arxiv', true],
      ['chemrxiv', true],
      ['rss', true],
    ]);
    const corpus = rt.store.loadCorpus();
    expect(corpus.length).toBeGreaterThanOrEqual(5 + 5 + 4);
    expect(new Set(corpus.map((d) => d.id)).size).toBe(corpus.length);
    expect(rt.store.readCursors().arxiv?.lastSuccessTo).toBe('2026-10-24');
    expect(existsSync(join(dataDir, 'raw', '2026-10-24'))).toBe(true);
    expect(
      readdirSync(join(dataDir, 'raw', '2026-10-24')).some((f) => f.startsWith('arxiv-')),
    ).toBe(true);

    // The arXiv window covered the whole 180-day backfill on the first run.
    const arxivCall = fetchFn.calls.find((c) => c.url.includes('export.arxiv.org'))!;
    expect(decodeURIComponent(arxivCall.url.replaceAll('+', ' '))).toContain(
      'submittedDate:[202604270000 TO 202610242359]',
    );

    // Second run: Nature answers 304, nothing is duplicated, ids are stable.
    const rt2 = createRuntime({
      dataDir,
      now,
      fetchFn,
      config: testConfig(),
      log: silentLogger,
      sleep: noSleep,
    });
    rt2.config.sources.arxiv.pageSize = 5;
    const second = await collect(rt2, { sources: ['arxiv', 'chemrxiv', 'rss'] });
    expect(second.merge.added).toBe(0);
    const corpus2 = rt2.store.loadCorpus();
    expect(corpus2.map((d) => d.id).sort()).toEqual(corpus.map((d) => d.id).sort());
    const natureCalls = fetchFn.calls.filter((c) => c.url === 'https://www.nature.com/nchem.rss');
    expect(natureCalls[1]!.headers['If-None-Match']).toBe('"nchem-1"');
  });

  it('reports a failing source without aborting the others', async () => {
    const fetchFn = fakeFetch([
      {
        match: (u) => u.includes('export.arxiv.org'),
        respond: () => new Response('boom', { status: 400 }),
      },
      {
        match: (u) => u.includes('api.crossref.org'),
        respond: () => new Response('{"status":"ok","message":{"total-results":0,"items":[]}}'),
      },
    ]);
    const rt = createRuntime({
      dataDir: tempDir(),
      fetchFn,
      config: testConfig(),
      log: silentLogger,
      sleep: noSleep,
    });
    const r = await collect(rt, { sources: ['arxiv', 'chemrxiv'] });
    expect(r.reports.find((x) => x.source === 'arxiv')).toMatchObject({ ok: false });
    expect(r.reports.find((x) => x.source === 'chemrxiv')).toMatchObject({ ok: true });
    expect(rt.store.readCursors().arxiv).toBeUndefined();
  });
});

describe('computeWindow', () => {
  it('backfills on the first run and resumes with overlap afterwards', () => {
    expect(computeWindow(arxivConnector, undefined, '2026-10-24', 180, 3)).toEqual({
      from: '2026-04-27',
      to: '2026-10-24',
    });
    expect(
      computeWindow(
        arxivConnector,
        { lastSuccessTo: '2026-10-20', lastRunAt: '' },
        '2026-10-24',
        180,
        3,
      ),
    ).toEqual({
      from: '2026-10-17',
      to: '2026-10-24',
    });
    expect(
      computeWindow(
        rssConnector,
        { lastSuccessTo: '2026-10-20', lastRunAt: '' },
        '2026-10-24',
        180,
        3,
      ).from,
    ).toBe('2026-10-17');
    expect(computeWindow(arxivConnector, undefined, '2026-10-24', 180, 3, 7).from).toBe(
      '2026-10-17',
    );
  });
});
