/**
 * Deduplication across sources. Records are linked when they share a DOI, an arXiv id or a
 * normalized title (in that priority), then merged into one development that keeps every source.
 */
import { normalizeArxivId, titleKey, type Development } from '@chembridge/core';

/** Lower index = preferred as the primary record of a merged group. */
const SOURCE_PRIORITY = [
  'arxiv',
  'chemrxiv',
  'biorxiv',
  'medrxiv',
  'crossref-journals',
  'europepmc',
];

function priority(source: string): number {
  const i = SOURCE_PRIORITY.indexOf(source);
  return i === -1 ? SOURCE_PRIORITY.length : i;
}

export function identityKeys(d: Development): string[] {
  const keys: string[] = [];
  if (d.doi && !d.doi.startsWith('10.48550/')) keys.push(`doi:${d.doi}`);
  const arxiv = d.arxivId ?? normalizeArxivId(d.doi);
  if (arxiv) keys.push(`arxiv:${arxiv}`);
  const t = titleKey(d.title);
  if (t) keys.push(`title:${t}`);
  return keys;
}

class UnionFind {
  private readonly parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.parent[i] !== i) {
      this.parent[i] = this.parent[this.parent[i]!]!;
      i = this.parent[i]!;
    }
    return i;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

export interface MergeStats {
  before: number;
  incoming: number;
  after: number;
  added: number;
  merged: number;
}

/**
 * Merges `incoming` into `existing`. Ids of existing records are preserved, so links to a
 * development stay valid when a later source (e.g. the journal version) is folded into it.
 */
export function mergeDevelopments(
  existing: Development[],
  incoming: Development[],
): { records: Development[]; stats: MergeStats } {
  const all = [...existing, ...incoming];
  const isExisting = (i: number) => i < existing.length;
  const uf = new UnionFind(all.length);
  const firstByKey = new Map<string, number>();
  all.forEach((d, i) => {
    for (const k of identityKeys(d)) {
      const j = firstByKey.get(k);
      if (j === undefined) firstByKey.set(k, i);
      else uf.union(i, j);
    }
  });
  const groups = new Map<number, number[]>();
  all.forEach((_, i) => {
    const r = uf.find(i);
    const g = groups.get(r);
    if (g) g.push(i);
    else groups.set(r, [i]);
  });

  const records: Development[] = [];
  let added = 0;
  let merged = 0;
  for (const members of groups.values()) {
    const items = members.map((i) => all[i]!);
    const hasExisting = members.some(isExisting);
    if (!hasExisting) added++;
    if (members.length > 1) merged++;
    const idSource = hasExisting ? members.filter(isExisting).map((i) => all[i]!) : items;
    const id = [...idSource].sort(
      (a, b) => a.ingestedAt.localeCompare(b.ingestedAt) || a.id.localeCompare(b.id),
    )[0]!.id;
    records.push(items.length === 1 ? { ...items[0]!, id } : mergeGroup(items, id));
  }
  records.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  return {
    records,
    stats: {
      before: existing.length,
      incoming: incoming.length,
      after: records.length,
      added,
      merged,
    },
  };
}

function mergeGroup(items: Development[], id: string): Development {
  const byPriority = [...items].sort(
    (a, b) =>
      priority(a.primarySource) - priority(b.primarySource) ||
      Number(a.abstractIsExcerpt) - Number(b.abstractIsExcerpt) ||
      b.abstract.length - a.abstract.length,
  );
  const primary = byPriority[0]!;
  const bestAbstract = [...items].sort(
    (a, b) =>
      Number(a.abstractIsExcerpt) - Number(b.abstractIsExcerpt) ||
      b.abstract.length - a.abstract.length,
  )[0]!;
  const doi =
    byPriority.map((d) => d.doi).find((x) => x && !x.startsWith('10.48550/')) ??
    byPriority.map((d) => d.doi).find(Boolean);
  const arxivId = byPriority.map((d) => d.arxivId).find(Boolean);
  const sources = new Map<string, Development['sources'][number]>();
  for (const d of items) {
    for (const s of d.sources) {
      const k = `${s.source}|${s.nativeId}`;
      const prev = sources.get(k);
      if (!prev || prev.fetchedAt < s.fetchedAt) sources.set(k, s);
    }
  }
  const links = new Map<string, Development['links'][number]>();
  for (const d of items)
    for (const l of d.links) links.set(l.url.toLowerCase().replace(/\/+$/, ''), l);
  const union = (xs: string[][], max: number) => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const arr of xs)
      for (const x of arr) {
        const k = x.toLowerCase();
        if (!seen.has(k)) {
          seen.add(k);
          out.push(x);
        }
      }
    return out.slice(0, max);
  };
  return {
    ...primary,
    id,
    ...(doi ? { doi } : {}),
    ...(arxivId ? { arxivId } : {}),
    abstract: bestAbstract.abstract,
    abstractIsExcerpt: bestAbstract.abstractIsExcerpt,
    authors: primary.authors.length
      ? primary.authors
      : (items.find((d) => d.authors.length)?.authors ?? []),
    publishedAt: items.map((d) => d.publishedAt).sort()[0]!,
    license: primary.license ?? items.find((d) => d.license)?.license,
    sources: [...sources.values()].sort((a, b) => priority(a.source) - priority(b.source)),
    topics: union(
      items.map((d) => d.topics),
      40,
    ),
    keywords: union(
      items.map((d) => d.keywords),
      12,
    ),
    links: [...links.values()],
    chemistrySource: items.some((d) => d.chemistrySource),
    ingestedAt: items.map((d) => d.ingestedAt).sort()[0]!,
  };
}
