/**
 * `probe`: one small live request per endpoint, printed as a table. Used to re-verify
 * docs/SOURCES.md and as `record-fixtures`' source of truth for test fixtures.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PIPELINE_ROOT } from '../config.ts';
import { buildArxivUrl } from '../connectors/arxiv.ts';
import { CROSSREF_API, CROSSREF_SELECT } from '../connectors/crossref.ts';
import { BIORXIV_API } from '../connectors/biorxiv.ts';
import { buildEpmcUrl } from '../connectors/europepmc.ts';
import { POLICIES } from '../connectors/types.ts';
import { HttpError, type RequestPolicy } from '../http/client.ts';
import type { Runtime } from '../runtime.ts';
import { addDays, todayUtc } from '../store.ts';

interface ProbeTarget {
  name: string;
  url: string;
  policy: RequestPolicy;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  robots?: boolean;
  fixture?: string;
  /** Trims a large response before it is written as a fixture. */
  trim?: (text: string) => string;
}

function trimJson(path: (d: any) => unknown[] | undefined, keep: number) {
  return (text: string) => {
    const d = JSON.parse(text);
    const arr = path(d);
    if (Array.isArray(arr)) arr.splice(keep);
    return JSON.stringify(d, null, 1);
  };
}

function trimXmlItems(tag: 'entry' | 'item', keep: number) {
  return (xml: string) => {
    const re = new RegExp(`<${tag}[\\s>][\\s\\S]*?</${tag}>`, 'g');
    let n = 0;
    return xml.replace(re, (m) => (++n <= keep ? m : ''));
  };
}

export function probeTargets(rt: Runtime): ProbeTarget[] {
  const today = todayUtc(rt.now);
  const week = addDays(today, -7);
  const polite = Boolean(rt.env.contactEmail);
  const mail = rt.env.contactEmail ? `&mailto=${encodeURIComponent(rt.env.contactEmail)}` : '';
  const arxiv = rt.config.sources.arxiv;
  const feeds = rt.config.sources.rss.feeds;
  return [
    {
      name: 'arxiv',
      url: buildArxivUrl(
        `${arxiv.queries[0]!.search} AND (cat:cs.LG OR cat:cs.AI)`,
        addDays(today, -30),
        today,
        0,
        5,
      ),
      policy: POLICIES.arxiv,
      fixture: 'arxiv.xml',
    },
    {
      name: 'chemrxiv (crossref)',
      url: `${CROSSREF_API}/prefixes/10.26434/works?filter=type:posted-content,from-posted-date:${week}&rows=5&select=${CROSSREF_SELECT}${mail}`,
      policy: POLICIES.crossrefList(polite),
      fixture: 'crossref-chemrxiv.json',
    },
    {
      name: 'chemrxiv engage (expected: bot challenge)',
      url: 'https://chemrxiv.org/engage/chemrxiv/public-api/v1/items?limit=1',
      policy: { ...POLICIES.feed, retries: 0 },
    },
    {
      name: 'crossref journals (JCIM)',
      url: `${CROSSREF_API}/journals/1549-9596/works?filter=type:journal-article,from-created-date:${addDays(today, -21)}&rows=5&select=${CROSSREF_SELECT}${mail}`,
      policy: POLICIES.crossrefList(polite),
      fixture: 'crossref-journal.json',
    },
    {
      name: 'biorxiv',
      url: `${BIORXIV_API}/details/biorxiv/${week}/${today}/0/json?category=biophysics`,
      policy: POLICIES.biorxiv,
      fixture: 'biorxiv.json',
      trim: trimJson((d) => d.collection, 6),
    },
    {
      name: 'europepmc',
      url: buildEpmcUrl(rt.config.sources.europepmc.query, addDays(today, -14), today, 5, '*'),
      policy: POLICIES.europepmc,
      fixture: 'europepmc.json',
    },
    {
      name: 'openalex (singleton)',
      url: 'https://api.openalex.org/works/doi:10.1038/s41557-026-02269-5?select=id,doi,primary_topic,keywords',
      policy: POLICIES.openalex,
      fixture: 'openalex.json',
    },
    {
      name: 'semantic scholar (batch)',
      url: 'https://api.semanticscholar.org/graph/v1/paper/batch?fields=title,tldr,citationCount,externalIds,url',
      method: 'POST',
      body: JSON.stringify({ ids: ['ARXIV:2005.11401', 'DOI:10.1038/s41586-021-03819-2'] }),
      headers: { 'Content-Type': 'application/json' },
      policy: { ...POLICIES.semanticscholar, retries: 1 },
      fixture: 'semanticscholar.json',
    },
    {
      name: 'pubchem',
      url: 'https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/lithium%20iron%20phosphate/property/MolecularFormula,Title/JSON',
      policy: POLICIES.pubchem,
      fixture: 'pubchem.json',
    },
    {
      name: 'hacker news (algolia)',
      url: 'https://hn.algolia.com/api/v1/search?query=retrosynthesis&tags=story&hitsPerPage=5',
      policy: POLICIES.hn,
      fixture: 'hn.json',
    },
    {
      name: 'github search',
      url: 'https://api.github.com/search/repositories?q=retrosynthesis&sort=stars&per_page=5',
      policy: POLICIES.github(Boolean(rt.env.githubToken)),
      headers: {
        Accept: 'application/vnd.github+json',
        ...(rt.env.githubToken ? { Authorization: `Bearer ${rt.env.githubToken}` } : {}),
      },
      fixture: 'github.json',
    },
    ...feeds.map((f) => ({
      name: `rss:${f.id}`,
      url: f.url,
      policy: POLICIES.feed,
      robots: true,
      fixture: `rss-${f.id}.xml`,
      trim: trimXmlItems('item', 4),
    })),
  ];
}

export interface ProbeRow {
  name: string;
  status: string;
  ms: number;
  bytes: number;
  validators: string;
  note: string;
}

export async function probe(
  rt: Runtime,
  opts: { recordFixtures?: boolean } = {},
): Promise<ProbeRow[]> {
  const rows: ProbeRow[] = [];
  const fixtureDir = join(PIPELINE_ROOT, 'test', 'fixtures');
  if (opts.recordFixtures) mkdirSync(fixtureDir, { recursive: true });
  for (const t of probeTargets(rt)) {
    const started = Date.now();
    try {
      const res = await rt.http.request(t.url, {
        source: 'probe',
        policy: t.policy,
        method: t.method ?? 'GET',
        ...(t.body ? { body: t.body } : {}),
        ...(t.headers ? { headers: t.headers } : {}),
        ...(t.robots ? { robots: true } : {}),
        acceptStatuses: [404],
      });
      const validators = [
        res.headers.get('etag') ? 'ETag' : '',
        res.headers.get('last-modified') ? 'Last-Modified' : '',
      ]
        .filter(Boolean)
        .join('+');
      rows.push({
        name: t.name,
        status: String(res.status),
        ms: Date.now() - started,
        bytes: res.text.length,
        validators,
        note: '',
      });
      if (opts.recordFixtures && t.fixture && res.status === 200) {
        const body = t.trim ? t.trim(res.text) : res.text;
        writeFileSync(join(fixtureDir, t.fixture), body);
      }
    } catch (err) {
      const status = err instanceof HttpError ? String(err.status ?? 'ERR') : 'ERR';
      rows.push({
        name: t.name,
        status,
        ms: Date.now() - started,
        bytes: 0,
        validators: '',
        note: (err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 140),
      });
    }
  }
  return rows;
}
