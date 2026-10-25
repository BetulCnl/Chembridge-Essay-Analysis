/** RSS 2.0 output: the site's own feed of the best recent chemistry × CS developments. */
import { chemNode, csNode, type AnalyzedDevelopment } from '@chembridge/core';

export function escapeXml(s: string): string {
  return s.replace(
    /[<>&'"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!,
  );
}

function rfc822(isoDate: string): string {
  return new Date(`${isoDate}T12:00:00Z`).toUTCString();
}

export interface FeedOptions {
  siteUrl?: string | undefined;
  title?: string;
  description?: string;
  generatedAt: Date;
  excerptChars: number;
}

export function itemLink(siteUrl: string | undefined, id: string, fallback: string): string {
  return siteUrl ? `${siteUrl.replace(/\/+$/, '')}/#/item/${id}` : fallback;
}

export function buildRss(items: AnalyzedDevelopment[], opts: FeedOptions): string {
  const site = opts.siteUrl?.replace(/\/+$/, '');
  const title = opts.title ?? 'ChemBridge — Chemistry × Computer Science';
  const description =
    opts.description ??
    'Recent chemistry developments that are ripe for computer-science approaches, scored and mapped daily.';
  const entries = items.map((d) => {
    const cells = d.cells
      .map(
        (c) =>
          `${chemNode(c.chem)?.short.en ?? c.chem} × ${csNode(c.cs)?.short.en ?? c.cs}${c.inferred ? ' (potential)' : ''}`,
      )
      .join(', ');
    const excerpt =
      d.abstract.length > opts.excerptChars
        ? d.abstract.slice(0, opts.excerptChars) + '…'
        : d.abstract;
    const html =
      `<p><strong>Suitability ${d.score.total}/100</strong> · ${escapeXml(cells)}</p>` +
      (excerpt ? `<p>${escapeXml(excerpt)}</p>` : '') +
      `<p>Source: <a href="${escapeXml(d.url)}">${escapeXml(d.venue)}</a></p>`;
    const categories = [
      ...new Set([
        ...d.chem.map((c) => chemNode(c.id)?.label.en ?? c.id),
        ...d.cs.filter((c) => !c.inferred).map((c) => csNode(c.id)?.label.en ?? c.id),
      ]),
    ];
    return [
      '    <item>',
      `      <title>${escapeXml(d.title)}</title>`,
      `      <link>${escapeXml(itemLink(site, d.id, d.url))}</link>`,
      `      <guid isPermaLink="false">chembridge:${d.id}</guid>`,
      `      <pubDate>${rfc822(d.publishedAt)}</pubDate>`,
      ...categories.map((c) => `      <category>${escapeXml(c)}</category>`),
      `      <description>${escapeXml(html)}</description>`,
      '    </item>',
    ].join('\n');
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${escapeXml(title)}</title>`,
    `    <link>${escapeXml(site ?? 'https://github.com/chembridge/chembridge')}</link>`,
    `    <description>${escapeXml(description)}</description>`,
    '    <language>en</language>',
    `    <lastBuildDate>${opts.generatedAt.toUTCString()}</lastBuildDate>`,
    site
      ? `    <atom:link href="${escapeXml(site)}/data/feed.xml" rel="self" type="application/rss+xml"/>`
      : '',
    ...entries,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter(Boolean)
    .join('\n');
}
