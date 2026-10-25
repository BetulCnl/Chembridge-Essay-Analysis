/**
 * Crossref REST API (https://api.crossref.org). Used for:
 *  - ChemRxiv preprints (DOI prefix 10.26434, type posted-content). The ChemRxiv Engage API sits
 *    behind a Cloudflare challenge, so we read ChemRxiv's own Crossref registrations instead.
 *  - Chemistry journals by ISSN (ACS / RSC / Nature), whose RSS feeds are bot-protected or only
 *    expose the latest few items.
 * Rate limits since 2025-12-01: public pool 1 list req/s, polite pool (mailto) 3 list req/s.
 */
import type { Development, DevelopmentType } from '@chembridge/core';
import { finalizeDraft, isCreativeCommons, type DraftDevelopment } from '../normalize.ts';
import type { JournalConfig } from '../config.ts';
import {
  POLICIES,
  type Connector,
  type ConnectorContext,
  type ConnectorResult,
  type CollectWindow,
} from './types.ts';

export const CROSSREF_API = 'https://api.crossref.org';

export const CROSSREF_SELECT = [
  'DOI',
  'title',
  'abstract',
  'author',
  'posted',
  'created',
  'published',
  'published-online',
  'issued',
  'URL',
  'license',
  'group-title',
  'subject',
  'type',
  'container-title',
  'publisher',
  'relation',
  'link',
].join(',');

interface CrossrefDate {
  'date-parts'?: Array<Array<number | null>>;
  'date-time'?: string;
}

export interface CrossrefWork {
  DOI: string;
  title?: string[];
  abstract?: string;
  author?: Array<{ given?: string; family?: string; name?: string }>;
  posted?: CrossrefDate;
  created?: CrossrefDate;
  published?: CrossrefDate;
  'published-online'?: CrossrefDate;
  issued?: CrossrefDate;
  URL?: string;
  license?: Array<{ URL?: string; 'content-version'?: string }>;
  'group-title'?: string;
  subject?: string[];
  type?: string;
  'container-title'?: string[];
  publisher?: string;
  link?: Array<{ URL?: string }>;
}

export interface CrossrefListMessage {
  'total-results': number;
  'next-cursor'?: string;
  items: CrossrefWork[];
}

export function crossrefDate(d: CrossrefDate | undefined): string | undefined {
  const parts = d?.['date-parts']?.[0];
  if (!parts || parts[0] == null) return undefined;
  const [y, m = 1, day = 1] = parts.map((p) => (p == null ? 1 : p));
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Notices that are not research developments; dropped at ingestion. */
const NON_RESEARCH =
  /^(correction|retraction|erratum|corrigendum|expression of concern|additions and corrections|withdrawn|editorial board|masthead|issue (editorial )?masthead|issue publication information|table of contents|(front|back|inside( front| back)?) cover|cover (image|picture|feature))\b/i;

export interface CrossrefParseOptions {
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  type: DevelopmentType;
  venueFallback: string;
  chemistrySource: boolean;
}

export function parseCrossrefWorks(
  message: CrossrefListMessage,
  opts: CrossrefParseOptions,
): DraftDevelopment[] {
  const out: DraftDevelopment[] = [];
  for (const w of message.items ?? []) {
    const title = w.title?.[0]?.trim();
    if (!title || NON_RESEARCH.test(title)) continue;
    const publishedAt =
      opts.type === 'preprint'
        ? (crossrefDate(w.posted) ?? crossrefDate(w.created))
        : (crossrefDate(w['published-online']) ??
          crossrefDate(w.published) ??
          crossrefDate(w.issued) ??
          crossrefDate(w.created));
    if (!publishedAt) continue;
    const license =
      w.license?.find((l) => l['content-version'] === 'vor')?.URL ?? w.license?.[0]?.URL;
    const topics = [
      ...(w.subject ?? []).map((s) => `subject:${s}`),
      ...(w['group-title'] ? [`group:${w['group-title']}`] : []),
    ];
    out.push({
      source: opts.source,
      nativeId: w.DOI,
      sourceUrl: opts.sourceUrl,
      fetchedAt: opts.fetchedAt,
      title,
      abstract: w.abstract,
      authors: (w.author ?? []).map((a) => a.name ?? [a.given, a.family].filter(Boolean).join(' ')),
      publishedAt,
      type: opts.type,
      venue: w['container-title']?.[0] ?? opts.venueFallback,
      url: w.URL ?? `https://doi.org/${w.DOI}`,
      doi: w.DOI,
      license,
      topics,
      chemistrySource: opts.chemistrySource,
      redistributable: isCreativeCommons(license),
    });
  }
  return out;
}

function withMailto(params: URLSearchParams, ctx: ConnectorContext): URLSearchParams {
  if (ctx.env.contactEmail) params.set('mailto', ctx.env.contactEmail);
  return params;
}

interface PagedQuery {
  path: string;
  filter: string;
  rows: number;
  parse: Omit<CrossrefParseOptions, 'sourceUrl' | 'fetchedAt'>;
}

async function collectCursor(
  ctx: ConnectorContext,
  q: PagedQuery,
): Promise<{ records: Development[]; fetched: number }> {
  const policy = POLICIES.crossrefList(Boolean(ctx.env.contactEmail));
  const records: Development[] = [];
  let fetched = 0;
  let cursor = '*';
  for (let page = 0; page < 200; page++) {
    const params = withMailto(
      new URLSearchParams({
        filter: q.filter,
        rows: String(q.rows),
        cursor,
        select: CROSSREF_SELECT,
      }),
      ctx,
    );
    const url = `${CROSSREF_API}${q.path}?${params.toString()}`;
    const { data } = await ctx.http.getJson<{ status: string; message: CrossrefListMessage }>(url, {
      source: q.parse.source,
      policy,
    });
    const message = data?.message;
    if (!message || !message.items?.length) break;
    fetched += message.items.length;
    for (const d of parseCrossrefWorks(message, {
      ...q.parse,
      sourceUrl: url,
      fetchedAt: ctx.now.toISOString(),
    })) {
      const dev = finalizeDraft(d);
      if (dev) records.push(dev);
    }
    ctx.log.info(q.parse.source, {
      path: q.path,
      page,
      got: message.items.length,
      total: message['total-results'],
    });
    if (!message['next-cursor'] || message.items.length < q.rows) break;
    cursor = message['next-cursor'];
  }
  return { records, fetched };
}

export function chemrxivQuery(prefix: string, w: CollectWindow, rows: number): PagedQuery {
  return {
    path: `/prefixes/${prefix}/works`,
    filter: `type:posted-content,from-posted-date:${w.from},until-posted-date:${w.to}`,
    rows,
    parse: {
      source: 'chemrxiv',
      type: 'preprint',
      venueFallback: 'ChemRxiv',
      chemistrySource: true,
    },
  };
}

export const chemrxivConnector: Connector = {
  id: 'chemrxiv',
  label: 'ChemRxiv (via Crossref)',
  kind: 'api',
  supportsBackfill: true,
  enabled: (c) => c.sources.chemrxiv.enabled,
  async collect(ctx, window): Promise<ConnectorResult> {
    const cfg = ctx.config.sources.chemrxiv;
    const { records, fetched } = await collectCursor(
      ctx,
      chemrxivQuery(cfg.doiPrefix, window, cfg.pageSize),
    );
    // Crossref reports the publisher as ACS; the venue users know is ChemRxiv.
    for (const r of records) r.venue = 'ChemRxiv';
    return { records, fetched, notModified: false, warnings: [] };
  },
};

export function journalQuery(j: JournalConfig, w: CollectWindow, rows: number): PagedQuery {
  return {
    path: `/journals/${j.issn}/works`,
    filter: `type:journal-article,from-created-date:${w.from},until-created-date:${w.to}`,
    rows,
    parse: {
      source: 'crossref-journals',
      type: 'article',
      venueFallback: j.name,
      chemistrySource: j.chemistry,
    },
  };
}

export const crossrefJournalsConnector: Connector = {
  id: 'crossref-journals',
  label: 'Chemistry journals (via Crossref)',
  kind: 'api',
  supportsBackfill: true,
  enabled: (c) => c.sources['crossref-journals'].enabled,
  async collect(ctx, window): Promise<ConnectorResult> {
    const cfg = ctx.config.sources['crossref-journals'];
    const records: Development[] = [];
    const warnings: string[] = [];
    let fetched = 0;
    for (const j of cfg.journals) {
      try {
        const r = await collectCursor(ctx, journalQuery(j, window, cfg.pageSize));
        records.push(...r.records);
        fetched += r.fetched;
      } catch (err) {
        warnings.push(`${j.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (warnings.length === cfg.journals.length)
      throw new Error(`all journals failed: ${warnings[0]}`);
    return { records, fetched, notModified: false, warnings };
  },
};
