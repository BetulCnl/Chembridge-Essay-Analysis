/**
 * arXiv legacy API (Atom). Terms: https://info.arxiv.org/help/api/tou.html
 * — no more than one request every three seconds, one connection at a time;
 * descriptive metadata (incl. abstracts) is CC0.
 */
import { toIsoDate } from '@chembridge/core';
import type { Development } from '@chembridge/core';
import { finalizeDraft, type DraftDevelopment } from '../normalize.ts';
import { asArray, text, xmlParser } from '../xml.ts';
import { POLICIES, type Connector, type ConnectorContext, type ConnectorResult } from './types.ts';

export const ARXIV_API = 'https://export.arxiv.org/api/query';

export function buildArxivUrl(
  search: string,
  from: string,
  to: string,
  start: number,
  max: number,
): string {
  const f = from.replaceAll('-', '') + '0000';
  const t = to.replaceAll('-', '') + '2359';
  const q = `${search} AND submittedDate:[${f} TO ${t}]`;
  const params = new URLSearchParams({
    search_query: q,
    start: String(start),
    max_results: String(max),
    sortBy: 'submittedDate',
    sortOrder: 'descending',
  });
  return `${ARXIV_API}?${params.toString()}`;
}

export interface ArxivParseOptions {
  fetchedAt: string;
  sourceUrl: string;
  chemCategories: string[];
  csCategories: string[];
}

export interface ArxivPage {
  total: number;
  entries: number;
  drafts: DraftDevelopment[];
}

export function parseArxivFeed(xml: string, opts: ArxivParseOptions): ArxivPage {
  const doc = xmlParser.parse(xml) as Record<string, any>;
  const feed = doc.feed ?? {};
  const total = Number(text(feed['opensearch:totalResults']) ?? 0);
  const entries = asArray(feed.entry);
  const drafts: DraftDevelopment[] = [];
  for (const e of entries) {
    const idUrl = text(e.id) ?? '';
    // An error response is an Atom feed with a single entry whose id points at /api/errors.
    if (idUrl.includes('/api/errors'))
      throw new Error(`arXiv API error: ${text(e.summary) ?? 'unknown'}`);
    const m = /abs\/(.+?)(v\d+)?$/.exec(idUrl);
    if (!m) continue;
    const arxivId = m[1]!;
    const categories = asArray<Record<string, string>>(e.category)
      .map((c) => c['@_term'])
      .filter(Boolean) as string[];
    const primary = e['arxiv:primary_category']?.['@_term'] as string | undefined;
    if (primary && !categories.includes(primary)) categories.unshift(primary);
    const isChem = categories.some((c) => opts.chemCategories.includes(c));
    const isCs = categories.some((c) => opts.csCategories.includes(c) || c.startsWith('cs.'));
    const topics = categories.map((c) => `arxiv:${c}`);
    if (isChem && isCs) topics.push('arxiv:cross-list:chem-cs');
    const publishedAt = toIsoDate(text(e.published));
    if (!publishedAt) continue;
    drafts.push({
      source: 'arxiv',
      nativeId: arxivId,
      sourceUrl: opts.sourceUrl,
      fetchedAt: opts.fetchedAt,
      title: text(e.title) ?? '',
      abstract: text(e.summary),
      authors: asArray<Record<string, unknown>>(e.author).map((a) => text(a.name)),
      publishedAt,
      type: 'preprint',
      venue: 'arXiv',
      url: `https://arxiv.org/abs/${arxivId}`,
      doi: text(e['arxiv:doi']),
      arxivId,
      license: 'arXiv metadata: CC0 1.0',
      topics,
      linkText: [text(e['arxiv:comment'])],
      chemistrySource: isChem,
      redistributable: true,
    });
  }
  return { total, entries: entries.length, drafts };
}

export const arxivConnector: Connector = {
  id: 'arxiv',
  label: 'arXiv',
  kind: 'api',
  supportsBackfill: true,
  enabled: (c) => c.sources.arxiv.enabled,
  async collect(ctx: ConnectorContext, window): Promise<ConnectorResult> {
    const cfg = ctx.config.sources.arxiv;
    const records: Development[] = [];
    const warnings: string[] = [];
    let fetched = 0;
    for (const query of cfg.queries) {
      let start = 0;
      let total = Infinity;
      let emptyRetries = 0;
      while (start < total && start < 30_000) {
        const url = buildArxivUrl(query.search, window.from, window.to, start, cfg.pageSize);
        const res = await ctx.http.get(url, { source: 'arxiv', policy: POLICIES.arxiv });
        const page = parseArxivFeed(res.text, {
          fetchedAt: ctx.now.toISOString(),
          sourceUrl: url,
          chemCategories: cfg.chemCategories,
          csCategories: cfg.csCategories,
        });
        total = page.total;
        if (page.entries === 0 && start < total) {
          // The legacy API occasionally returns an empty page mid-result; retry it a couple of times.
          if (++emptyRetries > 2) {
            warnings.push(`arxiv:${query.id}: empty page at start=${start} of ${total}, stopped`);
            break;
          }
          continue;
        }
        emptyRetries = 0;
        fetched += page.entries;
        for (const d of page.drafts) {
          const dev = finalizeDraft(d);
          if (dev) records.push(dev);
        }
        ctx.log.info(`arxiv:${query.id}`, { start, got: page.entries, total });
        start += page.entries;
      }
    }
    return { records, fetched, notModified: false, warnings };
  },
};
