/**
 * Local-only topic statistics over the whole corpus, including records that are not published:
 * which substance and material classes appear more often lately, how often their papers already
 * use computer-science methods, and how often they report quantitative results.
 *
 * The output is written outside the published tree and the command refuses to run in CI, so it
 * never reaches the data branch or the site.
 */
import { analyzeDevelopment, stripMarkup, type Development } from '@chembridge/core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Runtime } from '../runtime.ts';

/** Head nouns that name a class of substances or materials (plural → singular). */
const HEADS: Record<string, string> = {};
for (const h of [
  'framework',
  'perovskite',
  'alloy',
  'electrolyte',
  'catalyst',
  'electrocatalyst',
  'photocatalyst',
  'polymer',
  'copolymer',
  'peptide',
  'inhibitor',
  'ligand',
  'nanoparticle',
  'nanocluster',
  'nanosheet',
  'nanocrystal',
  'cluster',
  'cage',
  'cocrystal',
  'solvent',
  'liquid',
  'dye',
  'emitter',
  'semiconductor',
  'oxide',
  'sulfide',
  'nitride',
  'carbide',
  'chalcogenide',
  'halide',
  'hydrogel',
  'glass',
  'zeolite',
  'membrane',
  'sorbent',
  'adsorbent',
  'dot',
  'cathode',
  'anode',
  'macrocycle',
  'degrader',
  'glue',
  'antibiotic',
  'antimicrobial',
  'fluorophore',
  'probe',
  'photosensitizer',
  'enzyme',
  'aptamer',
  'lipid',
  'nanozyme',
  'mxene',
  'carbene',
  'radical',
  'polyoxometalate',
  'metallacycle',
  'salt',
  'binder',
  'additive',
  'battery',
  'molecule',
  'material',
  'compound',
  'derivative',
  'complex',
  'surfactant',
  'elastomer',
  'resin',
  'ionomer',
  'conjugate',
  'agonist',
  'antagonist',
  'scaffold',
  'monomer',
  'crystal',
  'film',
  'fiber',
  'foam',
  'aerogel',
  'coating',
  'plastic',
  'vitrimer',
  'nanotube',
  'graphene',
  'superconductor',
  'magnet',
  'phosphor',
  'scintillator',
  'pigment',
  'drug',
  'prodrug',
  'antibody',
  'nanocarrier',
  'micelle',
  'vesicle',
  'liposome',
  'dendrimer',
  'heterostructure',
  'thermoelectric',
  'piezoelectric',
  'ferroelectric',
  'photovoltaic',
  'cell',
]) {
  HEADS[h] = h;
  const plural = /(x|s|ch|sh)$/.test(h)
    ? `${h}es`
    : /[^aeiou]y$/.test(h)
      ? `${h.slice(0, -1)}ies`
      : `${h}s`;
  HEADS[plural] = h;
}

/** Words that never start or fill a topic phrase. */
const STOP = new Set(
  `a an and or of in on for to with by from at as via into onto over under the this that these
  those its their our new novel efficient highly high-performance enhanced improved advanced
  based using toward towards through between within based-on simple facile robust stable
  functional multifunctional versatile selective effective potential possible various different
  several two three single-step one-pot rational design designed engineered engineering
  study studies role effect effects insight insights understanding mechanism mechanisms
  synthesis synthesized preparation prepared performance application applications use used
  low large small ultra ultrahigh superior excellent outstanding remarkable unprecedented
  boosted boosting enabling enabled promoting promoted driven induced mediated assisted
  related other such both all each than more most less key main new-generation next-generation
  state-of-the-art first general universal series library family class type types kind
  starting parent promising active sensitive bulk single thin resulting corresponding
  ii iii iv oer her orr co2rr evolution reaction reduction oxidation commercial conventional
  traditional typical common representative model target targeted known emerging`.split(/\s+/),
);

/** Venues whose papers draw wide attention (used as one of several signals). */
const TOP_VENUE =
  /^(nature|science|cell|joule|chem$|journal of the american chemical society|angewandte|advanced materials|acs central science|nature communications|science advances)/i;

/** Abstract phrases that indicate measured values or a set of compounds/materials. */
const DATA_PATTERNS = [
  /\b\d+(?:\.\d+)?\s?(?:%|mv|ma|mah|ev|nm|°c|mpa|gpa|ms\/cm|s\/cm|wh\/kg|mg\/g|mmol\/g|μm|µm|kcal\/mol|kj\/mol|ppm|nm\b)/i,
  /\b(?:ic50|ec50|ki|kd|mic|ld50|half-life|yield|selectivity|conductivity|efficiency|capacity|stability|solubility|binding affinity)\b/i,
  /\b(?:series of|library of|a total of|set of|panel of)\b/i,
  /\b\d{2,}\s+(?:compounds|derivatives|molecules|materials|samples|catalysts|complexes|analogs|analogues|structures|candidates|variants|polymers|alloys)\b/i,
];

const DRUG = new Set(['drug', 'biochem']);
const MATERIALS = new Set([
  'solidstate',
  'energy',
  'polymers',
  'nano',
  'catalysis',
  'electrochem',
  'green',
]);

interface DocInfo {
  date: string;
  csUsed: boolean;
  data: boolean;
  top: boolean;
  domain: 'drug' | 'materials' | 'other';
  title: string;
  url: string;
  venue: string;
}

export interface TopicStat {
  phrase: string;
  docs: number;
  recent: number;
  previous: number;
  /** Share of all corpus records in the recent window vs the previous one, ≥ 1 means rising. */
  growth: number;
  csShare: number;
  dataShare: number;
  topVenueShare: number;
  domain: 'drug' | 'materials' | 'other';
  score: number;
  examples: Array<{ title: string; url: string; venue: string; date: string }>;
}

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[^a-z0-9\- ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/** Phrases of 1–3 modifiers followed by a class head noun, keyed by their singular form. */
export function topicPhrases(text: string): Set<string> {
  const w = words(text);
  const out = new Set<string>();
  for (let i = 0; i < w.length; i++) {
    const head = HEADS[w[i]!];
    if (!head) continue;
    for (let k = 1; k <= 3 && i - k >= 0; k++) {
      const mods = w.slice(i - k, i);
      if (mods.some((m) => STOP.has(m) || m.length < 3 || /^\d/.test(m) || HEADS[m] === m)) break;
      out.add(`${mods.join(' ')} ${head}`);
    }
  }
  return out;
}

function daysBefore(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export function topicStats(
  corpus: Development[],
  opts: { windowDays?: number; minDocs?: number } = {},
): TopicStat[] {
  const windowDays = opts.windowDays ?? 56;
  const minDocs = opts.minDocs ?? 15;
  const latest = corpus.reduce((m, d) => (d.publishedAt > m ? d.publishedAt : m), '');
  const recentFrom = daysBefore(latest, windowDays);
  const previousFrom = daysBefore(latest, windowDays * 2);

  const docs: DocInfo[] = [];
  const index = new Map<string, number[]>();
  let allRecent = 0;
  let allPrevious = 0;
  for (const d of corpus) {
    const a = analyzeDevelopment(d);
    if (!a.relevant) continue;
    const abstract = stripMarkup(d.abstract ?? '');
    const chem = a.chem.map((c) => c.id);
    const info: DocInfo = {
      date: d.publishedAt,
      csUsed: a.cs.some((c) => !c.inferred),
      data:
        a.signals.some((s) => s.startsWith('data.')) || DATA_PATTERNS.some((p) => p.test(abstract)),
      top: TOP_VENUE.test(d.venue ?? ''),
      domain: chem.some((c) => DRUG.has(c))
        ? 'drug'
        : chem.some((c) => MATERIALS.has(c))
          ? 'materials'
          : 'other',
      title: d.title,
      url: d.url,
      venue: d.venue ?? '',
    };
    if (info.date >= recentFrom) allRecent++;
    else if (info.date >= previousFrom) allPrevious++;
    const id = docs.push(info) - 1;
    for (const p of topicPhrases(`${d.title}. ${abstract}`)) {
      const list = index.get(p);
      if (list) list.push(id);
      else index.set(p, [id]);
    }
  }

  const stats: TopicStat[] = [];
  for (const [phrase, ids] of index) {
    if (ids.length < minDocs) continue;
    const list = ids.map((i) => docs[i]!);
    const recent = list.filter((x) => x.date >= recentFrom).length;
    const previous = list.filter((x) => x.date >= previousFrom && x.date < recentFrom).length;
    const growth =
      (recent + 1) / Math.max(1, allRecent) / ((previous + 1) / Math.max(1, allPrevious));
    const share = (f: (x: DocInfo) => boolean) => list.filter(f).length / list.length;
    const csShare = share((x) => x.csUsed);
    const dataShare = share((x) => x.data);
    const topVenueShare = share((x) => x.top);
    const counts = { drug: 0, materials: 0, other: 0 };
    for (const x of list) counts[x.domain]++;
    const domain = (Object.keys(counts) as Array<keyof typeof counts>).sort(
      (a, b) => counts[b] - counts[a],
    )[0]!;
    // Volume, momentum, untouched by CS, data-rich, attention — multiplied so a topic must do
    // reasonably on all of them.
    const score =
      Math.log2(1 + list.length) *
      Math.sqrt(Math.min(3, growth)) *
      (1 - csShare) ** 1.5 *
      (0.3 + dataShare) *
      (1 + topVenueShare);
    const examples = list
      .filter((x) => !x.csUsed)
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 5)
      .map(({ title, url, venue, date }) => ({ title, url, venue, date }));
    stats.push({
      phrase,
      docs: list.length,
      recent,
      previous,
      growth,
      csShare,
      dataShare,
      topVenueShare,
      domain,
      score,
      examples,
    });
  }

  // Drop a phrase when a longer phrase containing it covers most of the same papers.
  const byPhrase = new Map(stats.map((s) => [s.phrase, s]));
  const keep = stats.filter((s) => {
    for (const other of byPhrase.values())
      if (other !== s && other.phrase.endsWith(` ${s.phrase}`) && other.docs >= 0.6 * s.docs)
        return false;
    return true;
  });
  return keep.sort((a, b) => b.score - a.score);
}

function pct(x: number): string {
  return `${Math.round(x * 100)}%`;
}

export function topicsMarkdown(stats: TopicStat[], limit = 60): string {
  const rows = stats
    .slice(0, limit)
    .map(
      (s, i) =>
        `| ${i + 1} | ${s.phrase} | ${s.domain} | ${s.docs} | ${s.recent}/${s.previous} | ×${s.growth.toFixed(2)} | ${pct(s.csShare)} | ${pct(s.dataShare)} | ${pct(s.topVenueShare)} | ${s.score.toFixed(2)} |`,
    );
  return [
    '| # | topic | domain | papers | recent/previous | growth | CS share | data share | top venues | score |',
    '|---|---|---|---|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

export async function topics(
  rt: Runtime,
  opts: { outDir?: string; windowDays?: number; minDocs?: number } = {},
): Promise<TopicStat[]> {
  if (process.env.CI) throw new Error('topics is a local-only command and does not run in CI');
  const corpus = rt.store.loadCorpus();
  const stats = topicStats(corpus, opts);
  const outDir = resolve(opts.outDir ?? join(rt.store.root, '..', '.private', 'topics'));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'topics.json'), JSON.stringify(stats, null, 2));
  writeFileSync(join(outDir, 'topics.md'), topicsMarkdown(stats));
  rt.log.info('topics written', { corpus: corpus.length, topics: stats.length, outDir });
  return stats;
}
