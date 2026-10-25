/**
 * bioRxiv / medRxiv "details" API (https://api.biorxiv.org/).
 * Format: /details/{server}/{from}/{to}/{cursor}/json?category=<name>, 30 records per call.
 * The `category` filter works for bioRxiv; for medRxiv it is ignored (verified 2026-10-24), so
 * medRxiv results are filtered client-side and the connector is disabled by default.
 */
import type { Development } from '@chembridge/core';
import { finalizeDraft, isCreativeCommons, type DraftDevelopment } from '../normalize.ts';
import {
  POLICIES,
  type Connector,
  type ConnectorContext,
  type ConnectorResult,
  type CollectWindow,
} from './types.ts';

export const BIORXIV_API = 'https://api.biorxiv.org';

export interface BiorxivRecord {
  doi: string;
  title: string;
  authors: string;
  date: string;
  version: string;
  type?: string;
  license?: string;
  category?: string;
  abstract?: string;
  published?: string;
  server?: string;
}

export interface BiorxivResponse {
  messages?: Array<{
    status?: string;
    total?: string | number;
    count?: number;
    cursor?: number | string;
  }>;
  collection?: BiorxivRecord[];
}

/** "Ghosh, B.; Wang, S." → ["B. Ghosh", "S. Wang"] */
export function splitBiorxivAuthors(s: string): string[] {
  return s
    .split(';')
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => {
      const [family, given] = a.split(',').map((x) => x.trim());
      return given ? `${given} ${family}` : family!;
    });
}

export function parseBiorxiv(
  res: BiorxivResponse,
  server: string,
  opts: { sourceUrl: string; fetchedAt: string; categories?: string[] },
): DraftDevelopment[] {
  const wanted = opts.categories?.map((c) => c.toLowerCase());
  const label = server === 'medrxiv' ? 'medRxiv' : 'bioRxiv';
  const out: DraftDevelopment[] = [];
  for (const r of res.collection ?? []) {
    // Revised versions of older preprints are not new developments.
    if (r.version && r.version !== '1') continue;
    const category = (r.category ?? '').toLowerCase();
    if (wanted && wanted.length && !wanted.includes(category)) continue;
    out.push({
      source: server,
      nativeId: `${r.doi}v${r.version || '1'}`,
      sourceUrl: opts.sourceUrl,
      fetchedAt: opts.fetchedAt,
      title: r.title,
      abstract: r.abstract,
      authors: splitBiorxivAuthors(r.authors ?? ''),
      publishedAt: r.date,
      type: 'preprint',
      venue: label,
      url: `https://www.${server}.org/content/${r.doi}v${r.version || '1'}`,
      doi: r.doi,
      license: r.license,
      topics: category ? [`${server}:${category}`] : [],
      chemistrySource: false,
      redistributable: isCreativeCommons(r.license),
    });
  }
  return out;
}

async function collectServer(
  ctx: ConnectorContext,
  server: string,
  categories: string[],
  window: CollectWindow,
  serverSideFilter: boolean,
): Promise<{ records: Development[]; fetched: number }> {
  const records: Development[] = [];
  let fetched = 0;
  const runs = serverSideFilter ? categories : [undefined];
  for (const category of runs) {
    let cursor = 0;
    let total = Infinity;
    while (cursor < total && cursor < 50_000) {
      const q = category ? `?category=${encodeURIComponent(category)}` : '';
      const url = `${BIORXIV_API}/details/${server}/${window.from}/${window.to}/${cursor}/json${q}`;
      const { data } = await ctx.http.getJson<BiorxivResponse>(url, {
        source: server,
        policy: POLICIES.biorxiv,
      });
      const msg = data?.messages?.[0];
      const batch = data?.collection ?? [];
      if (!data || msg?.status !== 'ok' || batch.length === 0) break;
      total = Number(msg.total ?? 0);
      fetched += batch.length;
      for (const d of parseBiorxiv(data, server, {
        sourceUrl: url,
        fetchedAt: ctx.now.toISOString(),
        categories,
      })) {
        const dev = finalizeDraft(d);
        if (dev) records.push(dev);
      }
      cursor += batch.length;
      if (cursor % 300 === 0 || cursor >= total)
        ctx.log.info(`${server}${category ? ':' + category : ''}`, { cursor, total });
    }
  }
  return { records, fetched };
}

export const biorxivConnector: Connector = {
  id: 'biorxiv',
  label: 'bioRxiv',
  kind: 'api',
  supportsBackfill: true,
  enabled: (c) => c.sources.biorxiv.enabled,
  async collect(ctx, window): Promise<ConnectorResult> {
    const cfg = ctx.config.sources.biorxiv;
    const r = await collectServer(ctx, cfg.server, cfg.categories, window, true);
    return { ...r, notModified: false, warnings: [] };
  },
};

export const medrxivConnector: Connector = {
  id: 'medrxiv',
  label: 'medRxiv',
  kind: 'api',
  supportsBackfill: true,
  enabled: (c) => c.sources.medrxiv.enabled,
  async collect(ctx, window): Promise<ConnectorResult> {
    const cfg = ctx.config.sources.medrxiv;
    const r = await collectServer(ctx, cfg.server, cfg.categories, window, false);
    return { ...r, notModified: false, warnings: [] };
  },
};
