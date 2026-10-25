/**
 * publish: writes the static data the web app reads (see docs/ARCHITECTURE.md):
 *   meta.json, index.json, search.json, items/NN.json, trends.json, weekly/*.json, feed.xml
 * Every file is validated against the shared Zod schemas before it is written.
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  bucketOf,
  computeTrends,
  excerpt,
  isoWeek,
  rulesVersion,
  weekRange,
  type AnalyzedDevelopment,
  type CellStat,
  type DetailEntry,
  type IndexEntry,
  type SourceRunReport,
  type WeeklyDigest,
} from '@chembridge/core';
import {
  DetailEntrySchema,
  IndexEntrySchema,
  MetaSchema,
  TrendsSchema,
  WeeklyDigestSchema,
} from '@chembridge/core/schema';
import { type z } from 'zod';
import { buildRss } from '../feed.ts';
import { writeFileAtomic, writeJson } from '../fsutil.ts';
import type { EnrichReport } from '../enrich/index.ts';
import type { Runtime } from '../runtime.ts';
import { addDays, todayUtc } from '../store.ts';
import { buildAnalysis, takeLastAnalysis, type AnalysisSet } from './analyze.ts';

export interface PublishOptions {
  outDir?: string;
  analysis?: AnalysisSet;
}

export interface PublishResult {
  outDir: string;
  published: number;
  files: number;
}

function toIndex(d: AnalyzedDevelopment, buckets: number): IndexEntry {
  return {
    id: d.id,
    title: d.title,
    date: d.publishedAt,
    source: d.primarySource,
    type: d.type,
    venue: d.venue,
    score: d.score.total,
    chem: d.chem.map((c) => c.id),
    cs: d.cs.filter((c) => !c.inferred).map((c) => c.id),
    csInferred: d.cs.filter((c) => c.inferred).map((c) => c.id),
    cells: d.cells.map((c) => `${c.chem}|${c.cs}`),
    code: d.links.some((l) => l.kind === 'code'),
    data:
      d.links.some((l) => l.kind === 'data' || l.kind === 'model') ||
      d.signals.includes('artifact.dataAvailable'),
    bucket: bucketOf(d.id, buckets),
  };
}

function toDetail(d: AnalyzedDevelopment, excerptChars: number): DetailEntry {
  const { ingestedAt: _i, sources, abstract, ...rest } = d;
  return {
    ...rest,
    abstractExcerpt: excerpt(abstract, excerptChars),
    sources: sources.map(({ fetchedAt: _f, ...s }) => s),
  };
}

function validated<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success)
    throw new Error(`${what} does not match its schema: ${r.error.message.slice(0, 600)}`);
  return r.data;
}

function weeklyDigests(
  items: AnalyzedDevelopment[],
  weeks: string[],
  cells: CellStat[],
  top: number,
): WeeklyDigest[] {
  const byWeek = new Map<string, AnalyzedDevelopment[]>();
  for (const d of items) {
    const w = isoWeek(d.publishedAt);
    const list = byWeek.get(w);
    if (list) list.push(d);
    else byWeek.set(w, [d]);
  }
  const quietCells = cells.filter((c) => c.quietPromising);
  return weeks
    .map((week, wi) => {
      const list = (byWeek.get(week) ?? []).sort((a, b) => b.score.total - a.score.total);
      const bySource: Record<string, number> = {};
      for (const d of list) {
        const s = d.primarySource.startsWith('rss:') ? 'rss' : d.primarySource;
        bySource[s] = (bySource[s] ?? 0) + 1;
      }
      const rising = cells
        .map((c) => {
          const now = c.weekly[wi] ?? 0;
          const prev = c.weekly.slice(Math.max(0, wi - 4), wi);
          const base = prev.length ? prev.reduce((a, b) => a + b, 0) / prev.length : 0;
          return {
            chem: c.chem,
            cs: c.cs,
            recent: now,
            growth: Math.round(((now + 1) / (base + 1)) * 100) / 100,
          };
        })
        .filter((c) => c.recent >= 2 && c.growth >= 1.5)
        .sort((a, b) => b.growth - a.growth || b.recent - a.recent)
        .slice(0, 6);
      const ids = new Set(list.map((d) => d.id));
      const quiet = quietCells
        .filter((c) => c.topIds.some((id) => ids.has(id)))
        .slice(0, 6)
        .map((c) => ({ chem: c.chem, cs: c.cs, count: c.count, avgScore: c.avgScore }));
      const { from, to } = weekRange(week);
      return {
        week,
        from,
        to,
        total: list.length,
        bySource,
        topIds: list.slice(0, top).map((d) => d.id),
        rising,
        quiet,
      };
    })
    .filter((w) => w.total > 0);
}

/**
 * The output directory is wiped before writing. Only do that for the default location, an empty
 * directory, or a directory that already holds a previous ChemBridge publication.
 */
export function assertSafeToClear(dir: string, defaultDir: string): void {
  const target = resolve(dir);
  if (target === resolve(defaultDir) || !existsSync(target)) return;
  const entries = readdirSync(target);
  if (entries.length === 0 || entries.includes('meta.json')) return;
  throw new Error(
    `refusing to clear ${target}: it is not empty and does not look like a ChemBridge publication`,
  );
}

export async function publish(rt: Runtime, opts: PublishOptions = {}): Promise<PublishResult> {
  const { config, log } = rt;
  const set = opts.analysis ?? takeLastAnalysis() ?? (await buildAnalysis(rt, { fetch: false }));
  const outDir = opts.outDir ?? rt.store.publicDir;
  const { buckets, excerptChars, feedItems, feedDays, weeklyTop } = config.publish;
  assertSafeToClear(outDir, rt.store.publicDir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, 'items'), { recursive: true });
  mkdirSync(join(outDir, 'weekly'), { recursive: true });
  let files = 0;
  const write = (rel: string, value: unknown) => {
    writeJson(join(outDir, rel), value);
    files++;
  };

  const published = set.published;
  const index = published.map((d) =>
    validated(IndexEntrySchema, toIndex(d, buckets), `index entry ${d.id}`),
  );
  index.sort((a, b) => b.date.localeCompare(a.date) || b.score - a.score);
  write('index.json', index);

  const byBucket = new Map<number, DetailEntry[]>();
  for (const d of published) {
    const detail = validated(DetailEntrySchema, toDetail(d, excerptChars), `detail ${d.id}`);
    const b = bucketOf(d.id, buckets);
    const list = byBucket.get(b);
    if (list) list.push(detail);
    else byBucket.set(b, [detail]);
  }
  for (let b = 0; b < buckets; b++)
    write(`items/${String(b).padStart(2, '0')}.json`, byBucket.get(b) ?? []);

  write(
    'search.json',
    published.map((d) => ({
      id: d.id,
      title: d.title,
      keywords: d.keywords.join(' '),
      authors: d.authors.slice(0, 4).join(', '),
      text: d.abstract.slice(0, 300),
    })),
  );

  const trends = validated(
    TrendsSchema,
    {
      ...computeTrends(
        published.map((d) => ({
          id: d.id,
          date: d.publishedAt,
          score: d.score.total,
          cells: d.cells,
          chem: d.chem.map((c) => c.id),
          cs: d.cs.filter((c) => !c.inferred).map((c) => c.id),
        })),
        { now: rt.now },
      ),
      clusters: set.clusters,
    },
    'trends',
  );
  write('trends.json', trends);

  const digests = weeklyDigests(published, trends.weeks, trends.cells, weeklyTop).map((w) =>
    validated(WeeklyDigestSchema, w, `weekly ${w.week}`),
  );
  for (const w of digests) write(`weekly/${w.week}.json`, w);
  write(
    'weekly/index.json',
    digests.map((w) => ({ week: w.week, from: w.from, to: w.to, total: w.total })).reverse(),
  );

  const feedFrom = addDays(todayUtc(rt.now), -feedDays);
  const feedSet = published
    .filter((d) => d.publishedAt >= feedFrom)
    .sort((a, b) => b.score.total - a.score.total)
    .slice(0, feedItems);
  writeFileAtomic(
    join(outDir, 'feed.xml'),
    buildRss(feedSet, { siteUrl: rt.env.siteUrl, generatedAt: rt.now, excerptChars: 300 }),
  );
  files++;

  const status = rt.store.readState<Record<string, SourceRunReport>>('source-status.json', {});
  // Enrichment report of this run, or of the last run that fetched (publish-only runs).
  const enrichment =
    set.enrichment ??
    rt.store.readState<EnrichReport | undefined>('last-enrichment.json', undefined);
  const meta = validated(
    MetaSchema,
    {
      generatedAt: rt.now.toISOString(),
      rulesVersion: rulesVersion(),
      window: { from: addDays(todayUtc(rt.now), -config.retentionDays), to: todayUtc(rt.now) },
      counts: { corpus: set.stats.corpus, published: published.length },
      buckets,
      sources: Object.values(status).sort((a, b) => a.source.localeCompare(b.source)),
      ...(enrichment ? { enrichment } : {}),
      embeddings: set.embeddings,
      ...(rt.env.siteUrl ? { siteUrl: rt.env.siteUrl } : {}),
    },
    'meta',
  );
  if (set.enrichment) rt.store.writeState('last-enrichment.json', set.enrichment, true);
  write('meta.json', meta);

  // Long-term trend memory beyond the retention window: completed weeks' cell counts.
  const history = rt.store.readState<Record<string, Record<string, number>>>(
    'trend-history.json',
    {},
  );
  const currentWeek = isoWeek(todayUtc(rt.now));
  trends.weeks.forEach((w, i) => {
    if (w === currentWeek) return;
    const row: Record<string, number> = {};
    for (const c of trends.cells) if (c.weekly[i]) row[`${c.chem}|${c.cs}`] = c.weekly[i]!;
    history[w] = row;
  });
  rt.store.writeState('trend-history.json', history);

  log.info('published', {
    outDir,
    items: published.length,
    files,
    feedItems: feedSet.length,
    weeks: digests.length,
  });
  return { outDir, published: published.length, files };
}
