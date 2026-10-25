/**
 * Taxonomy mapping + explainable chemistry × CS suitability score.
 *
 * Every point of the score is produced by exactly one rule and recorded as a ScoreReason
 * (component, rule id, matched text, field, points), so the UI can show *why* a development
 * scored the way it did.
 */
import { compileTerm, DEFAULT_RULES, type Rules, type Term } from './rules.ts';
import type {
  ArtifactLink,
  Cell,
  Enrichment,
  ProblemType,
  ScoreBreakdown,
  ScoreComponentId,
  ScoreReason,
  TaxonomyHit,
} from './schema.ts';

export interface AnalyzeInput {
  title: string;
  abstract: string;
  topics: string[];
  venue: string;
  keywords: string[];
  links: ArtifactLink[];
  chemistrySource: boolean;
  enrichment?: Enrichment | undefined;
}

export interface Analysis {
  score: ScoreBreakdown;
  chem: TaxonomyHit[];
  cs: TaxonomyHit[];
  cells: Cell[];
  problemTypes: ProblemType[];
  signals: string[];
  /** False when the record is not chemistry (e.g. a cs.LG paper that only mentions "molecular"). */
  relevant: boolean;
}

type Field = 'title' | 'abstract' | 'meta';

interface Match {
  field: Field;
  text: string;
}

interface Fields {
  title: string;
  abstract: string;
  meta: string;
}

function findMatch(re: RegExp, fields: Fields, only?: Field): Match | undefined {
  const order: Field[] = only ? [only] : ['title', 'abstract', 'meta'];
  for (const f of order) {
    const m = re.exec(fields[f]);
    if (m) return { field: f, text: m[0].trim().slice(0, 80) };
  }
  return undefined;
}

function termMatch(t: Term, fields: Fields): Match | undefined {
  return findMatch(compileTerm(t.re, t.cs), fields);
}

/** Lower-cased topic keys used by taxonomy hints. */
export function topicKeys(input: Pick<AnalyzeInput, 'topics' | 'venue' | 'enrichment'>): string[] {
  const keys = input.topics.map((t) => t.toLowerCase());
  if (input.venue) keys.push(`venue:${input.venue.toLowerCase()}`);
  const oa = input.enrichment?.openalex;
  if (oa?.subfield) keys.push(`openalex:subfield:${oa.subfield.toLowerCase()}`);
  if (oa?.field) keys.push(`openalex:field:${oa.field.toLowerCase()}`);
  return keys;
}

const round1 = (x: number) => Math.round(x * 10) / 10;

export function analyzeDevelopment(input: AnalyzeInput, rules: Rules = DEFAULT_RULES): Analysis {
  const { taxonomy, scoring } = rules;
  const titleMult = scoring.titleMultiplier;
  const fields: Fields = {
    title: input.title,
    abstract: input.abstract,
    meta: [
      ...input.keywords,
      ...(input.enrichment?.openalex?.keywords ?? []),
      input.enrichment?.openalex?.topic ?? '',
    ]
      .filter(Boolean)
      .join(' ; '),
  };
  const topics = topicKeys(input);
  const reasons: ScoreReason[] = [];
  const signals: string[] = [];
  const push = (
    component: ScoreComponentId,
    rule: string,
    match: string,
    field: ScoreReason['field'],
    points: number,
  ) => reasons.push({ component, rule, match, field, points: round1(points) });

  // ---- Chemistry sub-fields -------------------------------------------------------------
  const chemRaw: TaxonomyHit[] = [];
  const chemTerms = new Set<string>();
  let chemInTitle = false;
  for (const node of taxonomy.chem) {
    let conf = 0;
    const evidence: string[] = [];
    for (const t of node.terms) {
      const m = termMatch(t, fields);
      if (!m) continue;
      conf += t.w * (m.field === 'title' ? titleMult : 1);
      evidence.push(m.text);
      chemTerms.add(m.text.toLowerCase());
      if (m.field === 'title') chemInTitle = true;
    }
    for (const key of topics) {
      const w = node.hints[key];
      if (w) {
        conf += w;
        evidence.push(key);
      }
    }
    if (conf > 0)
      chemRaw.push({
        id: node.id,
        confidence: round1(conf),
        evidence: [...new Set(evidence)].slice(0, 6),
        inferred: false,
      });
  }
  chemRaw.sort((a, b) => b.confidence - a.confidence);
  const threshold = input.chemistrySource
    ? taxonomy.minChemConfidence
    : taxonomy.minChemConfidenceNonChemSource;
  const topChem = chemRaw[0]?.confidence ?? 0;
  let chem = chemRaw
    .filter((h) => h.confidence >= threshold && h.confidence >= topChem * 0.35)
    .slice(0, 3);
  // A CS paper that mentions "drug" once is not chemistry: non-chemistry sources need several
  // distinct chemistry terms, or one in the title.
  if (!input.chemistrySource && !chemInTitle && chemTerms.size < taxonomy.minChemTermsNonChemSource)
    chem = [];
  const relevant = chem.length > 0 || input.chemistrySource;
  if (!chem.length && input.chemistrySource) {
    chem = [
      {
        id: 'general',
        confidence: 1,
        evidence: chemRaw
          .slice(0, 2)
          .flatMap((h) => h.evidence)
          .slice(0, 3),
        inferred: false,
      },
    ];
  }

  // ---- CS techniques (component 1) ------------------------------------------------------
  const csHits: Array<TaxonomyHit & { best: number }> = [];
  let csPoints = 0;
  for (const node of taxonomy.cs) {
    let best = 0;
    let bestMatch: Match | undefined;
    for (const t of node.terms) {
      const m = termMatch(t, fields);
      if (!m) continue;
      const v = t.w * (m.field === 'title' ? titleMult : 1);
      if (v > best) {
        best = v;
        bestMatch = m;
      }
    }
    if (!bestMatch) continue;
    const pts = node.points * best;
    csPoints += pts;
    push('csTechniques', node.id, bestMatch.text, bestMatch.field, pts);
    csHits.push({
      id: node.id,
      confidence: round1(pts),
      evidence: [bestMatch.text],
      inferred: false,
      best,
    });
  }
  const comps = scoring.components;
  if (topics.includes('arxiv:cross-list:chem-cs')) {
    csPoints += comps.csTechniques.crossListBonus;
    push('csTechniques', 'crossList', 'arXiv', 'meta', comps.csTechniques.crossListBonus);
  }
  const csScore = Math.min(comps.csTechniques.max, csPoints);

  // ---- Data intensity (component 2) -----------------------------------------------------
  let dataPoints = 0;
  for (const rule of comps.dataIntensity.rules) {
    const m = findMatch(compileTerm(rule.re, rule.cs), fields);
    if (!m) continue;
    dataPoints += rule.points;
    signals.push(rule.id);
    push('dataIntensity', rule.id, m.text, m.field, rule.points);
  }
  const dataScore = Math.min(comps.dataIntensity.max, dataPoints);

  // ---- Open code / data (component 3) ---------------------------------------------------
  let artifactPoints = 0;
  const oa = comps.openArtifacts;
  for (const kind of ['code', 'data', 'model'] as const) {
    const link = input.links.find((l) => l.kind === kind);
    if (!link) continue;
    artifactPoints += oa.linkPoints[kind];
    signals.push(`artifact.${kind}`);
    push('openArtifacts', `artifact.${kind}`, link.url, 'abstract', oa.linkPoints[kind]);
  }
  for (const rule of oa.rules) {
    const m = findMatch(compileTerm(rule.re, rule.cs), fields);
    if (!m) continue;
    artifactPoints += rule.points;
    signals.push(rule.id);
    push('openArtifacts', rule.id, m.text, m.field, rule.points);
  }
  const gh = input.enrichment?.github;
  if (gh && gh.repos.length > 0) {
    artifactPoints += oa.githubSignalPoints;
    signals.push('github');
    push(
      'openArtifacts',
      'github',
      `${gh.total} repos: ${gh.repos[0]!.name}`,
      'enrichment',
      oa.githubSignalPoints,
    );
  }
  const artifactScore = Math.min(oa.max, artifactPoints);

  // ---- Problem type (component 4) -------------------------------------------------------
  let problemPoints = 0;
  const problemTypes: ProblemType[] = [];
  for (const rule of comps.problemType.rules) {
    const m = findMatch(compileTerm(rule.re, rule.cs), fields);
    if (!m) continue;
    problemPoints += rule.points;
    problemTypes.push(rule.id as ProblemType);
    push('problemType', rule.id, m.text, m.field, rule.points);
  }
  const problemScore = Math.min(comps.problemType.max, problemPoints);

  // ---- Penalties --------------------------------------------------------------------------
  let penalty = 0;
  for (const rule of scoring.penalties) {
    const m = findMatch(compileTerm(rule.re, rule.cs), fields, rule.field);
    if (!m) continue;
    penalty += rule.points;
    push('penalty', rule.id, m.text, m.field, rule.points);
  }

  const total = Math.max(
    0,
    Math.min(100, Math.round(csScore + dataScore + artifactScore + problemScore + penalty)),
  );

  // ---- CS hits (existing + inferred) and matrix cells ----------------------------------
  csHits.sort((a, b) => b.confidence - a.confidence);
  const existing = csHits.filter((h) => h.best >= 0.6).slice(0, 3);
  const existingIds = new Set(existing.map((h) => h.id));
  const votes = new Map<string, { n: number; why: string[] }>();
  const vote = (cs: string, why: string, n = 1) => {
    if (existingIds.has(cs)) return;
    const v = votes.get(cs) ?? { n: 0, why: [] };
    v.n += n;
    v.why.push(why);
    votes.set(cs, v);
  };
  for (const r of scoring.inference.rules) {
    if (!signals.includes(r.when) && !problemTypes.includes(r.when as ProblemType)) continue;
    const w = r.w ?? 1;
    r.cs.forEach((cs, i) => vote(cs, r.when, i === 0 ? w : 0.6 * w));
  }
  for (const c of chem.slice(0, 1)) {
    const node = taxonomy.chem.find((n) => n.id === c.id);
    node?.defaultCs.forEach((cs, i) => vote(cs, `chem:${c.id}`, i === 0 ? 0.9 : 0.5));
  }
  const inferred: TaxonomyHit[] = [...votes.entries()]
    .sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]))
    .slice(0, scoring.inference.maxInferred)
    .map(([id, v]) => ({
      id,
      confidence: round1(v.n),
      evidence: [...new Set(v.why)].slice(0, 4),
      inferred: true,
    }));

  const cs: TaxonomyHit[] = [...existing.map(({ best: _best, ...h }) => h), ...inferred];
  const cellCs = existing.length ? existing.map(({ best: _best, ...h }) => h) : inferred;
  const maxChem = Math.max(...chem.map((c) => c.confidence), 1);
  const maxCs = Math.max(...cellCs.map((c) => c.confidence), 1);
  const cells: Cell[] = [];
  for (const c of chem.slice(0, 2)) {
    for (const s of cellCs) {
      cells.push({
        chem: c.id,
        cs: s.id,
        weight: round1((c.confidence / maxChem) * (s.confidence / maxCs)),
        inferred: s.inferred,
      });
    }
  }
  cells.sort((a, b) => b.weight - a.weight);

  return {
    score: {
      total,
      components: {
        csTechniques: { score: round1(csScore), max: comps.csTechniques.max },
        dataIntensity: { score: round1(dataScore), max: comps.dataIntensity.max },
        openArtifacts: { score: round1(artifactScore), max: oa.max },
        problemType: { score: round1(problemScore), max: comps.problemType.max },
        penalty: { score: round1(penalty), max: 0 },
      },
      reasons,
      rulesVersion: scoring.version,
    },
    chem,
    cs,
    cells: cells.slice(0, 4),
    problemTypes,
    signals,
    relevant,
  };
}
