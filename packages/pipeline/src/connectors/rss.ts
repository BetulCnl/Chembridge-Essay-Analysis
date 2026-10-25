/**
 * Generic RSS 2.0 / RSS 1.0 (RDF) / Atom connector. Feeds are web resources: robots.txt is
 * honoured, requests are conditional (ETag / Last-Modified) and only title, link, date and the
 * publisher-provided summary are kept.
 */
import { findDoi, stripMarkup, toIsoDate } from '@chembridge/core';
import type { Development } from '@chembridge/core';
import type { FeedConfig } from '../config.ts';
import { RobotsDisallowedError, BotChallengeError } from '../http/client.ts';
import { finalizeDraft, type DraftDevelopment } from '../normalize.ts';
import { asArray, text, xmlParser } from '../xml.ts';
import { POLICIES, type Connector, type ConnectorResult } from './types.ts';

type Node = Record<string, any>;

function linkOf(item: Node): string | undefined {
  const links = asArray<any>(item.link);
  for (const l of links) {
    if (typeof l === 'string') return l.trim();
    if (l && typeof l === 'object') {
      if (l['@_href'] && (!l['@_rel'] || l['@_rel'] === 'alternate')) return String(l['@_href']);
      const t = text(l);
      if (t) return t.trim();
    }
  }
  const about = item['@_rdf:about'];
  return typeof about === 'string' ? about : undefined;
}

/** Removes tracking parameters added to feed links. */
export function cleanFeedLink(url: string): string {
  try {
    const u = new URL(url);
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|sc$|src$|ref$|rss$)/i.test(p)) u.searchParams.delete(p);
    }
    return u.toString();
  } catch {
    return url;
  }
}

export interface RssParseOptions {
  feed: FeedConfig;
  fetchedAt: string;
}

export function parseFeed(xml: string, opts: RssParseOptions): DraftDevelopment[] {
  const doc = xmlParser.parse(xml) as Node;
  const channelItems = asArray<Node>(doc.rss?.channel?.item);
  const rdfItems = asArray<Node>(doc['rdf:RDF']?.item);
  const atomEntries = asArray<Node>(doc.feed?.entry);
  const items = [...channelItems, ...rdfItems, ...atomEntries];
  const drafts: DraftDevelopment[] = [];
  for (const item of items) {
    const title = text(item.title) ?? text(item['dc:title']);
    const link = linkOf(item);
    if (!title || !link) continue;
    const rawSummary =
      text(item['content:encoded']) ??
      text(item.description) ??
      text(item.summary) ??
      text(item.content) ??
      '';
    const doi =
      text(item['prism:doi']) ?? findDoi(text(item['dc:identifier'])) ?? findDoi(rawSummary);
    // Nature feeds prefix summaries with "Journal, Published online: <date>; doi:<doi>".
    const summary = stripMarkup(rawSummary).replace(
      /^[^;]{0,80}Published online:[^;]*;\s*doi:\S+\s*/i,
      '',
    );
    const date =
      toIsoDate(text(item.pubDate)) ??
      toIsoDate(text(item['dc:date'])) ??
      toIsoDate(text(item['prism:publicationDate'])) ??
      toIsoDate(text(item.published)) ??
      toIsoDate(text(item.updated));
    if (!date) continue;
    const creators = [
      ...asArray<any>(item['dc:creator']).map((c) => text(c)),
      ...asArray<Node>(item.author).map((a) => text(a.name) ?? text(a)),
    ];
    const categories = [...asArray<any>(item.category), ...asArray<any>(item['dc:subject'])]
      .map((c) => (typeof c === 'object' ? (c['@_term'] ?? text(c)) : text(c)))
      .filter((c): c is string => Boolean(c));
    const url = cleanFeedLink(link);
    drafts.push({
      source: `rss:${opts.feed.id}`,
      nativeId: text(item.guid) ?? text(item.id) ?? url,
      sourceUrl: opts.feed.url,
      fetchedAt: opts.fetchedAt,
      title,
      abstract: summary,
      authors: creators,
      publishedAt: date,
      type: opts.feed.type === 'news' ? 'news' : 'article',
      venue: opts.feed.name,
      url,
      doi,
      topics: categories.map((c) => `rss:${c}`),
      chemistrySource: opts.feed.chemistry,
      redistributable: false,
    });
  }
  return drafts;
}

export const rssConnector: Connector = {
  id: 'rss',
  label: 'RSS / Atom feeds',
  kind: 'feed',
  supportsBackfill: false,
  enabled: (c) => c.sources.rss.enabled,
  async collect(ctx, window): Promise<ConnectorResult> {
    const records: Development[] = [];
    const warnings: string[] = [];
    let fetched = 0;
    let notModifiedCount = 0;
    const feeds = ctx.config.sources.rss.feeds;
    for (const feed of feeds) {
      try {
        const res = await ctx.http.get(feed.url, {
          source: 'rss',
          policy: POLICIES.feed,
          conditional: true,
          robots: true,
          headers: {
            Accept:
              'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8',
          },
        });
        if (res.notModified) {
          notModifiedCount++;
          ctx.log.info(`rss:${feed.id} not modified`);
          continue;
        }
        const drafts = parseFeed(res.text, { feed, fetchedAt: ctx.now.toISOString() });
        fetched += drafts.length;
        for (const d of drafts) {
          if (d.publishedAt < window.from) continue;
          const dev = finalizeDraft(d);
          if (dev) records.push(dev);
        }
        ctx.log.info(`rss:${feed.id}`, { items: drafts.length });
      } catch (err) {
        const reason =
          err instanceof RobotsDisallowedError
            ? 'robots.txt disallows this feed'
            : err instanceof BotChallengeError
              ? 'bot-protection challenge (skipped, not circumvented)'
              : err instanceof Error
                ? err.message
                : String(err);
        warnings.push(`${feed.id}: ${reason}`);
        ctx.log.warn(`rss:${feed.id} skipped`, { reason });
      }
    }
    if (warnings.length === feeds.length && feeds.length > 0)
      throw new Error(`all feeds failed: ${warnings[0]}`);
    return {
      records,
      fetched,
      notModified: feeds.length > 0 && notModifiedCount === feeds.length,
      warnings,
    };
  },
};
