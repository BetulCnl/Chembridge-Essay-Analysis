/**
 * Enrichment API clients. Each function is a single, rate-limited lookup whose result is cached
 * by the caller (enrich/index.ts). Parsers are exported for fixture tests.
 */
import type { Compound, GithubRepo, HnStory } from '@chembridge/core';
import { POLICIES } from '../connectors/types.ts';
import type { HttpClient } from '../http/client.ts';
import type { RuntimeEnv } from '../config.ts';

// ---- OpenAlex (singleton DOI lookups are free and need no key) ---------------------------

export interface OpenAlexTopics {
  id: string;
  topic?: string;
  subfield?: string;
  field?: string;
  keywords: string[];
}

export function parseOpenAlexWork(json: any): OpenAlexTopics | undefined {
  if (!json?.id) return undefined;
  const pt = json.primary_topic;
  return {
    id: String(json.id),
    ...(pt?.display_name ? { topic: String(pt.display_name) } : {}),
    ...(pt?.subfield?.display_name ? { subfield: String(pt.subfield.display_name) } : {}),
    ...(pt?.field?.display_name ? { field: String(pt.field.display_name) } : {}),
    keywords: (json.keywords ?? [])
      .map((k: any) => String(k.display_name ?? k.keyword ?? ''))
      .filter(Boolean)
      .slice(0, 8),
  };
}

export async function openAlexByDoi(
  http: HttpClient,
  env: RuntimeEnv,
  doi: string,
): Promise<OpenAlexTopics | undefined> {
  const params = new URLSearchParams({ select: 'id,doi,primary_topic,keywords' });
  if (env.openalexApiKey) params.set('api_key', env.openalexApiKey);
  if (env.contactEmail) params.set('mailto', env.contactEmail);
  const url = `https://api.openalex.org/works/doi:${encodeURIComponent(doi)}?${params.toString()}`;
  const res = await http.get(url, {
    source: 'openalex',
    policy: POLICIES.openalex,
    acceptStatuses: [404],
  });
  if (res.status === 404) return undefined;
  return parseOpenAlexWork(JSON.parse(res.text));
}

// ---- Semantic Scholar (batch endpoint, up to 500 ids per call) ---------------------------

export interface S2Paper {
  paperId: string;
  url: string;
  tldr?: string;
  citationCount?: number;
}

export function parseS2Batch(json: unknown): Array<S2Paper | undefined> {
  if (!Array.isArray(json)) return [];
  return json.map((p: any) =>
    p?.paperId
      ? {
          paperId: String(p.paperId),
          url: String(p.url ?? `https://www.semanticscholar.org/paper/${p.paperId}`),
          ...(p.tldr?.text ? { tldr: String(p.tldr.text) } : {}),
          ...(typeof p.citationCount === 'number' ? { citationCount: p.citationCount } : {}),
        }
      : undefined,
  );
}

export async function s2Batch(
  http: HttpClient,
  env: RuntimeEnv,
  ids: string[],
): Promise<Array<S2Paper | undefined>> {
  const url = 'https://api.semanticscholar.org/graph/v1/paper/batch?fields=url,tldr,citationCount';
  const res = await http.request(url, {
    source: 'semanticscholar',
    policy: POLICIES.semanticscholar,
    method: 'POST',
    body: JSON.stringify({ ids }),
    headers: {
      'Content-Type': 'application/json',
      ...(env.s2ApiKey ? { 'x-api-key': env.s2ApiKey } : {}),
    },
  });
  return parseS2Batch(JSON.parse(res.text));
}

// ---- PubChem PUG REST ---------------------------------------------------------------------

export function parsePubChem(json: any, name: string): Compound | undefined {
  const p = json?.PropertyTable?.Properties?.[0];
  if (!p?.CID) return undefined;
  return {
    name,
    cid: Number(p.CID),
    ...(p.MolecularFormula ? { formula: String(p.MolecularFormula) } : {}),
    ...(p.Title ? { title: String(p.Title) } : {}),
    url: `https://pubchem.ncbi.nlm.nih.gov/compound/${p.CID}`,
  };
}

export async function pubchemByName(http: HttpClient, name: string): Promise<Compound | undefined> {
  const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(name)}/property/MolecularFormula,Title/JSON`;
  const res = await http.get(url, {
    source: 'pubchem',
    policy: POLICIES.pubchem,
    acceptStatuses: [400, 404],
  });
  if (res.status >= 400) return undefined;
  return parsePubChem(JSON.parse(res.text), name);
}

const ELEMENTS = new Set(
  'H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu'.split(
    ' ',
  ),
);

function isFormula(tok: string): boolean {
  if (!/^(?:[A-Z][a-z]?\d*(?:\.\d+)?){2,8}$/.test(tok) || !/\d/.test(tok)) return false;
  const symbols = tok.match(/[A-Z][a-z]?/g) ?? [];
  return symbols.every((s) => ELEMENTS.has(s));
}

const NAME_SUFFIX =
  /^[a-z][a-z0-9,'()-]{2,}(?:ane|ene|yne|anol|enol|one|amide|amine|ate|ide|ite|ium|oxide|azole|idine|furan|phene|ether|ester|ose|oate|ile|ine)$/;

const NOT_COMPOUNDS = new Set(
  (
    'machine online baseline pipeline outline guideline routine determine combine medicine engine define examine alone done none zone phone ' +
    'bone tone stone scene gene state rate date update estimate accurate candidate generate validate ultimate aggregate substrate climate ' +
    'separate moderate adequate intermediate template translate integrate evaluate illustrate demonstrate facilitate accelerate investigate ' +
    'elucidate simulate calculate regulate modulate activate deactivate elevate create debate private approximate guide wide side provide ' +
    'inside outside decide slide divide white write site suite elite despite unite favorite composite medium equilibrium premium consortium ' +
    'control protocol everyone someone cyclone intervene famine discipline decline incline timeline deadline genuine cuisine marine ' +
    'routine imagine doctrine machine fine line mine shine spine wine nine vaccine engine antiline quarantine ' +
    'immune bystander dose rose close purpose diagnose propose expose suppose compose impose chose whose loose ' +
    'profile mobile hostile fragile volatile textile versatile tile while smile file juvenile fertile sterile ' +
    'cohort consumption conformation nanoparticle nanoparticles hydrate anhydride halide oxide hydroxide carbide nitride sulfide'
  ).split(/\s+/),
);

/** Candidate compound names in a title: chemical formulas and words with chemical suffixes. */
export function compoundCandidates(title: string, max = 3): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const add = (s: string) => {
    const k = s.toLowerCase();
    if (seen.has(k) || out.length >= max) return;
    seen.add(k);
    out.push(s);
  };
  const tokens = title
    .replace(/[“”"()[\]{}:;,]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const raw of tokens) {
    const tok = raw
      .replace(/[.!?]+$/, '')
      .replace(/[₀-₉]/g, (d) => String(d.charCodeAt(0) - 0x2080));
    if (isFormula(tok)) add(tok);
  }
  for (const raw of tokens) {
    const w = raw.replace(/[.!?]+$/, '').toLowerCase();
    if (
      w.length >= 6 &&
      w.length <= 40 &&
      NAME_SUFFIX.test(w) &&
      !NOT_COMPOUNDS.has(w) &&
      !w.endsWith('-based')
    )
      add(w);
  }
  return out;
}

// ---- GitHub repository search ----------------------------------------------------------------

export function parseGithubSearch(json: any): { total: number; repos: GithubRepo[] } {
  const repos: GithubRepo[] = (json?.items ?? []).slice(0, 5).map((r: any) => ({
    name: String(r.full_name),
    url: String(r.html_url),
    stars: Number(r.stargazers_count ?? 0),
    ...(r.description ? { description: String(r.description).slice(0, 200) } : {}),
    ...(r.pushed_at ? { pushedAt: String(r.pushed_at) } : {}),
  }));
  return { total: Number(json?.total_count ?? repos.length), repos };
}

export async function githubSearch(
  http: HttpClient,
  env: RuntimeEnv,
  query: string,
): Promise<{ total: number; repos: GithubRepo[] }> {
  const q = `${query} in:name,description,readme`;
  const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=5`;
  const res = await http.get(url, {
    source: 'github',
    policy: POLICIES.github(Boolean(env.githubToken)),
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(env.githubToken ? { Authorization: `Bearer ${env.githubToken}` } : {}),
    },
  });
  return parseGithubSearch(JSON.parse(res.text));
}

// ---- Hacker News (Algolia) ---------------------------------------------------------------

export function parseHn(json: any): HnStory[] {
  return (json?.hits ?? [])
    .filter((h: any) => h?.title && h?.objectID)
    .map((h: any) => ({
      title: String(h.title),
      ...(h.url ? { url: String(h.url) } : {}),
      hnUrl: `https://news.ycombinator.com/item?id=${h.objectID}`,
      points: Number(h.points ?? 0),
      comments: Number(h.num_comments ?? 0),
      createdAt: String(h.created_at ?? ''),
    }))
    .sort((a: HnStory, b: HnStory) => b.points - a.points)
    .slice(0, 5);
}

export async function hnSearch(http: HttpClient, query: string): Promise<HnStory[]> {
  const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=10`;
  const { data } = await http.getJson<unknown>(url, { source: 'hn', policy: POLICIES.hn });
  return parseHn(data);
}
