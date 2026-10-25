/**
 * Europe PMC RESTful search (https://www.ebi.ac.uk/europepmc/webservices/rest/search).
 * No key; cursorMark pagination; resultType=core returns abstracts. Abstract copyright stays
 * with publishers/authors, so only an excerpt is stored unless the record carries a CC licence.
 */
import type { Development } from '@chembridge/core';
import { finalizeDraft, isCreativeCommons, type DraftDevelopment } from '../normalize.ts';
import { POLICIES, type Connector, type ConnectorResult } from './types.ts';

export const EUROPEPMC_API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';

export interface EpmcResult {
  id: string;
  source: string;
  pmid?: string;
  pmcid?: string;
  doi?: string;
  title?: string;
  authorString?: string;
  authorList?: { author?: Array<{ fullName?: string }> };
  journalInfo?: { journal?: { title?: string } };
  bookOrReportDetails?: { publisher?: string };
  firstPublicationDate?: string;
  abstractText?: string;
  keywordList?: { keyword?: string[] };
  license?: string;
  pubTypeList?: { pubType?: string[] };
}

export interface EpmcResponse {
  hitCount?: number;
  nextCursorMark?: string;
  resultList?: { result?: EpmcResult[] };
}

export function buildEpmcUrl(
  query: string,
  from: string,
  to: string,
  pageSize: number,
  cursorMark: string,
): string {
  const params = new URLSearchParams({
    query: `${query} AND FIRST_PDATE:[${from} TO ${to}]`,
    format: 'json',
    resultType: 'core',
    pageSize: String(pageSize),
    cursorMark,
  });
  return `${EUROPEPMC_API}?${params.toString()}`;
}

export function parseEpmc(
  res: EpmcResponse,
  opts: { sourceUrl: string; fetchedAt: string },
): DraftDevelopment[] {
  const out: DraftDevelopment[] = [];
  for (const r of res.resultList?.result ?? []) {
    if (!r.title || !r.firstPublicationDate) continue;
    const isPreprint = r.source === 'PPR';
    const authors =
      r.authorList?.author?.map((a) => a?.fullName ?? undefined) ??
      (r.authorString ?? '').split(/,\s*/);
    out.push({
      source: 'europepmc',
      nativeId: `${r.source}:${r.id}`,
      sourceUrl: opts.sourceUrl,
      fetchedAt: opts.fetchedAt,
      title: String(r.title).replace(/\.$/, ''),
      abstract: r.abstractText,
      authors,
      publishedAt: r.firstPublicationDate,
      type: isPreprint ? 'preprint' : 'article',
      venue:
        r.journalInfo?.journal?.title ??
        r.bookOrReportDetails?.publisher ??
        (isPreprint ? 'Preprint' : 'Europe PMC'),
      url: r.doi ? `https://doi.org/${r.doi}` : `https://europepmc.org/article/${r.source}/${r.id}`,
      doi: r.doi,
      license: r.license,
      keywords: r.keywordList?.keyword ?? [],
      topics: (r.pubTypeList?.pubType ?? []).map((t) => `pubtype:${t}`),
      chemistrySource: false,
      redistributable: isCreativeCommons(r.license),
    });
  }
  return out;
}

export const europepmcConnector: Connector = {
  id: 'europepmc',
  label: 'Europe PMC',
  kind: 'api',
  supportsBackfill: true,
  enabled: (c) => c.sources.europepmc.enabled,
  async collect(ctx, window): Promise<ConnectorResult> {
    const cfg = ctx.config.sources.europepmc;
    const records: Development[] = [];
    let fetched = 0;
    let cursor = '*';
    for (let page = 0; page < 100; page++) {
      const url = buildEpmcUrl(cfg.query, window.from, window.to, cfg.pageSize, cursor);
      const { data } = await ctx.http.getJson<EpmcResponse>(url, {
        source: 'europepmc',
        policy: POLICIES.europepmc,
      });
      const batch = data?.resultList?.result ?? [];
      if (!data || batch.length === 0) break;
      fetched += batch.length;
      for (const d of parseEpmc(data, { sourceUrl: url, fetchedAt: ctx.now.toISOString() })) {
        const dev = finalizeDraft(d);
        if (dev) records.push(dev);
      }
      ctx.log.info('europepmc', { page, got: batch.length, total: data.hitCount });
      if (!data.nextCursorMark || data.nextCursorMark === cursor || batch.length < cfg.pageSize)
        break;
      cursor = data.nextCursorMark;
    }
    return { records, fetched, notModified: false, warnings: [] };
  },
};
