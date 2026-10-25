/**
 * Enrichment orchestration: decides which developments get which lookups within the per-run
 * budgets, reads/writes the caches and opens a circuit breaker when a service keeps refusing
 * (e.g. Semantic Scholar's shared anonymous pool answering 429).
 */
import {
  csNode,
  type Analysis,
  type Compound,
  type Development,
  type Enrichment,
  type GithubRepo,
  type HnStory,
} from '@chembridge/core';
import { HttpError } from '../http/client.ts';
import type { Runtime } from '../runtime.ts';
import { EnrichCache } from './cache.ts';
import {
  compoundCandidates,
  githubSearch,
  hnSearch,
  openAlexByDoi,
  pubchemByName,
  s2Batch,
  type OpenAlexTopics,
  type S2Paper,
} from './sources.ts';

export interface EnrichCaches {
  openalex: EnrichCache<OpenAlexTopics>;
  s2: EnrichCache<S2Paper>;
  pubchem: EnrichCache<Omit<Compound, 'name'>>;
  github: EnrichCache<{ total: number; repos: GithubRepo[] }>;
  hn: EnrichCache<HnStory[]>;
}

export function openCaches(rt: Runtime): EnrichCaches {
  const p = (n: string) => rt.store.path('enrich', `${n}.json`);
  return {
    openalex: new EnrichCache(p('openalex'), 3650, rt.now),
    s2: new EnrichCache(p('semanticscholar'), 30, rt.now),
    pubchem: new EnrichCache(p('pubchem'), 3650, rt.now),
    github: new EnrichCache(p('github'), 14, rt.now),
    hn: new EnrichCache(p('hn'), 14, rt.now),
  };
}

export function saveCaches(c: EnrichCaches): void {
  for (const cache of Object.values(c)) cache.save();
}

export function openAlexKey(d: Development): string | undefined {
  if (d.doi) return d.doi;
  if (d.arxivId) return `10.48550/arxiv.${d.arxivId}`;
  return undefined;
}

export function s2Key(d: Development): string | undefined {
  if (d.arxivId) return `ARXIV:${d.arxivId}`;
  if (d.doi && !d.doi.startsWith('10.48550/')) return `DOI:${d.doi}`;
  return undefined;
}

export interface SignalQuery {
  /** Cache key, also shown in the UI. */
  key: string;
  csTerm: string;
  chemTerm: string;
}

const clean = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9+ -]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "Is there open source for this kind of work?" — one query per CS technique × chemistry term. */
export function signalQuery(a: Analysis): SignalQuery | undefined {
  const cs = a.cs[0];
  const chemRaw = a.chem[0]?.evidence.find((e) => !e.includes(':') && e.length > 2);
  if (!cs || !chemRaw) return undefined;
  const csRaw = cs.inferred
    ? csNode(cs.id)
        ?.label.en.replace(/\s*\(.*\)$/, '')
        .replace(/ & .*$/, '')
    : cs.evidence[0];
  if (!csRaw) return undefined;
  const csTerm = clean(csRaw);
  const chemTerm = clean(chemRaw);
  if (csTerm.length < 2 || chemTerm.length < 3) return undefined;
  return { key: `${csTerm} | ${chemTerm}`, csTerm, chemTerm };
}

/** Builds an item's enrichment purely from the caches (no network). */
export function enrichmentFromCache(
  d: Development,
  a: Analysis | undefined,
  c: EnrichCaches,
): Enrichment {
  const e: Enrichment = {};
  const oaKey = openAlexKey(d);
  const oa = oaKey ? c.openalex.value(oaKey) : undefined;
  if (oa) e.openalex = oa;
  const sKey = s2Key(d);
  const s2 = sKey ? c.s2.value(sKey) : undefined;
  if (s2) e.s2 = s2;
  const compounds = compoundCandidates(d.title)
    .map((name) => {
      const v = c.pubchem.value(name.toLowerCase());
      return v ? { name, ...v } : undefined;
    })
    .filter((x): x is Compound => Boolean(x));
  if (compounds.length) e.compounds = compounds;
  const q = a ? signalQuery(a) : undefined;
  if (q) {
    const gh = c.github.value(q.key);
    if (gh)
      e.github = {
        query: q.key,
        total: gh.total,
        repos: gh.repos,
        checkedAt: c.github.lookup(q.key)?.at ?? '',
      };
    const hn = c.hn.value(q.key);
    if (hn && hn.length)
      e.hn = { query: q.key, stories: hn, checkedAt: c.hn.lookup(q.key)?.at ?? '' };
  }
  return e;
}

export interface EnricherReport {
  lookups: number;
  hits: number;
  skipped?: string;
}

export type EnrichReport = Record<
  'openalex' | 'semanticscholar' | 'pubchem' | 'github' | 'hn',
  EnricherReport
>;

function fatal(err: unknown): boolean {
  // Rate-limit/auth refusals that survived the retries: stop calling that service this run.
  return (
    err instanceof HttpError && (err.status === 429 || err.status === 401 || err.status === 403)
  );
}

export async function fetchEnrichment(
  rt: Runtime,
  candidates: Array<{ d: Development; a: Analysis }>,
  caches: EnrichCaches,
): Promise<EnrichReport> {
  const cfg = rt.config.enrich;
  const log = rt.log.child('enrich');
  const report: EnrichReport = {
    openalex: { lookups: 0, hits: 0 },
    semanticscholar: { lookups: 0, hits: 0 },
    pubchem: { lookups: 0, hits: 0 },
    github: { lookups: 0, hits: 0 },
    hn: { lookups: 0, hits: 0 },
  };

  // OpenAlex topics (free singleton lookups).
  if (cfg.openalex.enabled) {
    for (const { d } of candidates) {
      if (report.openalex.lookups >= cfg.openalex.maxPerRun) break;
      const key = openAlexKey(d);
      if (!key || caches.openalex.lookup(key)) continue;
      report.openalex.lookups++;
      try {
        const v = await openAlexByDoi(rt.http, rt.env, key);
        caches.openalex.set(key, v);
        if (v) report.openalex.hits++;
      } catch (err) {
        if (fatal(err)) {
          report.openalex.skipped = String((err as Error).message).slice(0, 160);
          break;
        }
      }
    }
  } else report.openalex.skipped = 'disabled';

  // Semantic Scholar TLDRs (batched).
  if (cfg.semanticscholar.enabled) {
    const keys = candidates
      .map(({ d }) => s2Key(d))
      .filter((k): k is string => Boolean(k) && !caches.s2.lookup(k!))
      .slice(0, cfg.semanticscholar.maxPerRun);
    for (let i = 0; i < keys.length; i += 500) {
      const chunk = keys.slice(i, i + 500);
      report.semanticscholar.lookups += chunk.length;
      try {
        const res = await s2Batch(rt.http, rt.env, chunk);
        chunk.forEach((k, j) => {
          caches.s2.set(k, res[j]);
          if (res[j]) report.semanticscholar.hits++;
        });
      } catch (err) {
        report.semanticscholar.skipped = String((err as Error).message).slice(0, 160);
        break;
      }
    }
  } else report.semanticscholar.skipped = 'disabled';

  // PubChem compound names from titles.
  if (cfg.pubchem.enabled) {
    outer: for (const { d } of candidates) {
      for (const name of compoundCandidates(d.title)) {
        const key = name.toLowerCase();
        if (caches.pubchem.lookup(key)) continue;
        if (report.pubchem.lookups >= cfg.pubchem.maxLookupsPerRun) break outer;
        report.pubchem.lookups++;
        try {
          const v = await pubchemByName(rt.http, name);
          caches.pubchem.set(
            key,
            v
              ? {
                  cid: v.cid,
                  url: v.url,
                  ...(v.formula ? { formula: v.formula } : {}),
                  ...(v.title ? { title: v.title } : {}),
                }
              : undefined,
          );
          if (v) report.pubchem.hits++;
        } catch (err) {
          if (fatal(err)) {
            report.pubchem.skipped = String((err as Error).message).slice(0, 160);
            break outer;
          }
        }
      }
    }
  } else report.pubchem.skipped = 'disabled';

  // GitHub + HN "open source / community" signals, one query per technique × chemistry term.
  const queries: SignalQuery[] = [];
  const seenQ = new Set<string>();
  for (const { a } of candidates) {
    const q = signalQuery(a);
    if (q && !seenQ.has(q.key)) {
      seenQ.add(q.key);
      queries.push(q);
    }
  }
  if (cfg.github.enabled) {
    for (const q of queries) {
      if (report.github.lookups >= cfg.github.maxPerRun) break;
      if (caches.github.lookup(q.key)) continue;
      report.github.lookups++;
      try {
        const v = await githubSearch(rt.http, rt.env, `"${q.csTerm}" ${q.chemTerm}`);
        caches.github.set(q.key, v);
        if (v.total > 0) report.github.hits++;
      } catch (err) {
        report.github.skipped = String((err as Error).message).slice(0, 160);
        break;
      }
    }
  } else report.github.skipped = 'disabled';

  if (cfg.hn.enabled) {
    for (const q of queries) {
      if (report.hn.lookups >= cfg.hn.maxPerRun) break;
      if (caches.hn.lookup(q.key)) continue;
      report.hn.lookups++;
      try {
        const v = await hnSearch(rt.http, `${q.csTerm} ${q.chemTerm}`);
        caches.hn.set(q.key, v);
        if (v.length) report.hn.hits++;
      } catch (err) {
        if (fatal(err)) {
          report.hn.skipped = String((err as Error).message).slice(0, 160);
          break;
        }
      }
    }
  } else report.hn.skipped = 'disabled';

  saveCaches(caches);
  log.info('enrichment', report as unknown as Record<string, unknown>);
  return report;
}
