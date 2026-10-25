/**
 * analyze: score + taxonomy for the whole corpus, enrichment for the publishable candidates,
 * then embeddings → related developments and topic clusters for the published set.
 */
import {
  analyzeDevelopment,
  distinctiveTerms,
  documentFrequency,
  leaderClusters,
  topK,
  type Analysis,
  type AnalyzedDevelopment,
  type Cluster,
  type Development,
  type Enrichment,
} from '@chembridge/core';
import { createEmbedder, embedAll } from '../embeddings.ts';
import {
  enrichmentFromCache,
  fetchEnrichment,
  openCaches,
  type EnrichReport,
} from '../enrich/index.ts';
import type { Runtime } from '../runtime.ts';
import { addDays, todayUtc } from '../store.ts';

export interface AnalysisSet {
  published: AnalyzedDevelopment[];
  clusters: Cluster[];
  embeddings: string;
  enrichment?: EnrichReport;
  stats: { corpus: number; relevant: number; candidates: number; published: number };
}

function toAnalyzed(d: Development, a: Analysis, e: Enrichment): AnalyzedDevelopment {
  return {
    ...d,
    score: a.score,
    chem: a.chem,
    cs: a.cs,
    cells: a.cells,
    problemTypes: a.problemTypes,
    signals: a.signals,
    enrichment: e,
    related: [],
  };
}

function embeddingText(d: AnalyzedDevelopment): string {
  return `${d.title}. ${d.abstract.slice(0, 700)} ${d.keywords.join(', ')}`;
}

export async function buildAnalysis(rt: Runtime, opts: { fetch: boolean }): Promise<AnalysisSet> {
  const { config, log } = rt;
  const started = Date.now();
  const corpus = rt.store.loadCorpus();
  const caches = openCaches(rt);
  const { minScore, minScoreNews, maxItems } = config.publish;
  const threshold = (d: Development) => (d.type === 'news' ? minScoreNews : minScore);

  // Pass 1: cached OpenAlex topics only (they feed taxonomy hints).
  const pass1 = corpus.map((d) => ({
    d,
    a: analyzeDevelopment({ ...d, enrichment: enrichmentFromCache(d, undefined, caches) }),
  }));
  const relevant = pass1.filter((x) => x.a.relevant);
  // Slightly below the threshold, since enrichment can add points (GitHub signal, topics).
  const candidates = relevant
    .filter((x) => x.a.score.total >= threshold(x.d) - 5)
    .sort(
      (x, y) => y.a.score.total - x.a.score.total || y.d.publishedAt.localeCompare(x.d.publishedAt),
    );
  log.info('analysis pass 1', {
    corpus: corpus.length,
    relevant: relevant.length,
    candidates: candidates.length,
    ms: Date.now() - started,
  });

  let enrichment: EnrichReport | undefined;
  if (opts.fetch) enrichment = await fetchEnrichment(rt, candidates, caches);

  // Pass 2: full enrichment from caches (OpenAlex topics, GitHub/HN signal, PubChem, S2).
  const finals = candidates.map(({ d }) => {
    const base = enrichmentFromCache(d, undefined, caches);
    const a0 = analyzeDevelopment({ ...d, enrichment: base });
    const e = enrichmentFromCache(d, a0, caches);
    const a = e.github ? analyzeDevelopment({ ...d, enrichment: e }) : a0;
    return toAnalyzed(d, a, e);
  });
  const published = finals
    .filter((x) => x.score.total >= threshold(x))
    .sort((a, b) => b.score.total - a.score.total || b.publishedAt.localeCompare(a.publishedAt))
    .slice(0, maxItems);

  // Embeddings → related items and clusters.
  const embedder = await createEmbedder(rt);
  const vectors = await embedAll(
    rt,
    embedder,
    published.map((p) => ({ id: p.id, text: embeddingText(p) })),
  );
  const neighbours = topK(vectors, config.embeddings.relatedK, embedder.cacheable ? 0.45 : 0.2);
  published.forEach((p, i) => {
    p.related = neighbours[i]!.map((n) => published[n.j]!.id);
  });

  const order = published.map((_, i) => i); // already sorted by score
  const assignment = leaderClusters(
    vectors,
    order,
    embedder.cacheable ? config.embeddings.clusterThreshold : 0.35,
  );
  const groups = new Map<number, number[]>();
  assignment.forEach((leader, i) => {
    const g = groups.get(leader);
    if (g) g.push(i);
    else groups.set(leader, [i]);
  });
  const titles = published.map((p) => p.title);
  const df = documentFrequency(titles);
  const recentFrom = addDays(todayUtc(rt.now), -28);
  const clusters: Cluster[] = [];
  for (const [leader, members] of groups) {
    if (members.length < 4) continue;
    const items = members.map((i) => published[i]!);
    const label = distinctiveTerms(
      items.map((x) => x.title),
      df,
      titles.length,
      3,
    );
    if (!label.length) continue;
    const id = `c${published[leader]!.id}`;
    for (const x of items) x.cluster = id;
    clusters.push({
      id,
      label,
      size: items.length,
      avgScore: Math.round((items.reduce((s, x) => s + x.score.total, 0) / items.length) * 10) / 10,
      recent: items.filter((x) => x.publishedAt >= recentFrom).length,
      topIds: items.slice(0, 6).map((x) => x.id),
    });
  }
  clusters.sort((a, b) => b.recent - a.recent || b.size - a.size);

  log.info('analysis done', {
    published: published.length,
    clusters: clusters.length,
    embeddings: embedder.name,
    ms: Date.now() - started,
  });
  return {
    published,
    clusters: clusters.slice(0, 60),
    embeddings: embedder.name,
    ...(enrichment ? { enrichment } : {}),
    stats: {
      corpus: corpus.length,
      relevant: relevant.length,
      candidates: candidates.length,
      published: published.length,
    },
  };
}

let lastAnalysis: AnalysisSet | undefined;

/** CLI `analyze`: fetch enrichment and compute everything; the result is reused by `run`. */
export async function analyze(rt: Runtime): Promise<AnalysisSet> {
  lastAnalysis = await buildAnalysis(rt, { fetch: true });
  return lastAnalysis;
}

export function takeLastAnalysis(): AnalysisSet | undefined {
  const a = lastAnalysis;
  lastAnalysis = undefined;
  return a;
}
