import {
  cleanAuthors,
  dataDoiLinks,
  developmentId,
  excerpt,
  extractArtifactLinks,
  extractKeyphrases,
  normalizeArxivId,
  normalizeDoi,
  stripMarkup,
  type Development,
  type DevelopmentType,
} from '@chembridge/core';

/** What a connector produces before ids, links and excerpts are derived. */
export interface DraftDevelopment {
  source: string;
  nativeId: string;
  sourceUrl: string;
  fetchedAt: string;
  title: string;
  abstract?: string | undefined;
  authors: Array<string | undefined>;
  publishedAt: string;
  type: DevelopmentType;
  venue: string;
  url: string;
  doi?: string | undefined;
  arxivId?: string | undefined;
  license?: string | undefined;
  topics?: string[];
  keywords?: string[];
  /** Extra text scanned for code/data links only (e.g. arXiv comments), never stored. */
  linkText?: Array<string | undefined>;
  chemistrySource: boolean;
  /** Whether the licence allows storing the full abstract (else only an excerpt is kept). */
  redistributable: boolean;
}

/** Hard cap for stored abstracts, even when redistribution is allowed. */
const MAX_ABSTRACT = 4000;
const STORED_EXCERPT = 600;

export function finalizeDraft(d: DraftDevelopment): Development | undefined {
  const title = stripMarkup(d.title);
  if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(d.publishedAt)) return undefined;
  const fullAbstract = stripMarkup(d.abstract);
  const doi = normalizeDoi(d.doi);
  const arxivId = d.arxivId ? normalizeArxivId(d.arxivId) : normalizeArxivId(doi);
  const links = dedupeLinks([
    ...extractArtifactLinks(fullAbstract, ...(d.linkText ?? [])),
    ...dataDoiLinks(fullAbstract),
  ]);
  const abstract = d.redistributable
    ? excerpt(fullAbstract, MAX_ABSTRACT)
    : excerpt(fullAbstract, STORED_EXCERPT);
  const provided = (d.keywords ?? [])
    .filter((k): k is string => typeof k === 'string')
    .map((k) => stripMarkup(k));
  const keywords = uniq([
    ...provided.filter(Boolean),
    ...extractKeyphrases(title, fullAbstract, 4),
  ]).slice(0, 10);
  return {
    id: developmentId({ doi, arxivId, title, url: d.url }),
    ...(doi ? { doi } : {}),
    ...(arxivId ? { arxivId } : {}),
    title,
    abstract,
    abstractIsExcerpt: abstract.length < fullAbstract.length,
    authors: cleanAuthors(d.authors),
    publishedAt: d.publishedAt,
    type: d.type,
    venue: d.venue.replace(/\s+/g, ' ').trim(),
    url: d.url,
    ...(d.license ? { license: d.license } : {}),
    primarySource: d.source,
    sources: [{ source: d.source, nativeId: d.nativeId, url: d.sourceUrl, fetchedAt: d.fetchedAt }],
    topics: uniq(d.topics ?? []),
    keywords,
    links,
    chemistrySource: d.chemistrySource,
    ingestedAt: d.fetchedAt,
  };
}

export function isCreativeCommons(license: string | undefined): boolean {
  if (!license) return false;
  const l = license.toLowerCase();
  if (l === 'cc_no' || l.includes('no reuse')) return false;
  return l.includes('creativecommons.org') || /^cc[\s_-]?(by|0|zero)/.test(l) || l === 'cc0';
}

function dedupeLinks<T extends { url: string }>(links: T[]): T[] {
  const seen = new Set<string>();
  return links.filter((l) => {
    const k = l.url.toLowerCase().replace(/\/+$/, '');
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function uniq(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}
