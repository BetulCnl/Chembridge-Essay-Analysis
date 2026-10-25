/**
 * Layer A idea generation: deterministic, offline, template based (rules/ideas.json).
 * Runs in the browser for the detail page and in the pipeline for the weekly digest.
 */
import { fnv1a32 } from './ids.ts';
import { DEFAULT_RULES, type IdeaTemplate, type Rules } from './rules.ts';
import type {
  ArtifactLink,
  CellStat,
  Enrichment,
  I18nText,
  Idea,
  ProblemType,
  TaxonomyHit,
  Cell,
} from './schema.ts';

export interface IdeaSubject {
  id: string;
  title: string;
  publishedAt: string;
  url: string;
  topics: string[];
  chem: TaxonomyHit[];
  cs: TaxonomyHit[];
  cells: Cell[];
  problemTypes: ProblemType[];
  signals: string[];
  links: ArtifactLink[];
  enrichment: Enrichment;
}

export interface IdeaContext {
  now?: Date;
  /** Lookup of matrix statistics, used for the "why now" bullets. */
  cellStat?: (chem: string, cs: string) => CellStat | undefined;
  recentWeeks?: number;
  /** Nearest neighbours in the corpus (title + url), used as "similar work". */
  related?: Array<{ id: string; title: string; url: string }>;
  max?: number;
}

interface Pair {
  chem: string;
  cs: string;
  inferred: boolean;
}

type Slots = Record<string, I18nText>;

const LANGS = ['tr', 'en'] as const;

function both(s: string): I18nText {
  return { tr: s, en: s };
}

function fill(text: I18nText, slots: Slots): I18nText {
  const out = { tr: text.tr, en: text.en };
  for (const lang of LANGS) {
    const filled = out[lang].replace(/\{(\w+)\}/g, (m, key: string) => slots[key]?.[lang] ?? m);
    // A sentence may start with a lower-case slot ("{metric}; …"); capitalise it (tr: i → İ).
    out[lang] = filled.charAt(0).toLocaleUpperCase(lang) + filled.slice(1);
  }
  return out;
}

function shorten(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[,:;\s]+$/, '') + '…';
}

function joinList(items: string[], and: I18nText): I18nText {
  if (items.length <= 1) return both(items[0] ?? '');
  const head = items.slice(0, -1).join(', ');
  const last = items[items.length - 1]!;
  return { tr: head + and.tr + last, en: head + and.en + last };
}

function lower(t: I18nText): I18nText {
  return { tr: t.tr.toLocaleLowerCase('tr'), en: t.en.toLowerCase() };
}

function candidatePairs(item: IdeaSubject, rules: Rules): Pair[] {
  const pairs: Pair[] = [];
  const seen = new Set<string>();
  const add = (p: Pair) => {
    const k = `${p.chem}|${p.cs}`;
    if (seen.has(k)) return;
    seen.add(k);
    pairs.push(p);
  };
  for (const c of item.cells) add({ chem: c.chem, cs: c.cs, inferred: c.inferred });
  const topChem = item.chem[0]?.id ?? 'general';
  for (const h of item.cs) add({ chem: topChem, cs: h.id, inferred: h.inferred });
  const node = rules.taxonomy.chem.find((n) => n.id === topChem);
  const existing = new Set(item.cs.filter((h) => !h.inferred).map((h) => h.id));
  for (const cs of node?.defaultCs ?? []) add({ chem: topChem, cs, inferred: !existing.has(cs) });
  return pairs;
}

function templateScore(t: IdeaTemplate, pair: Pair, item: IdeaSubject): number | undefined {
  const a = t.appliesTo;
  if (a.mode === 'existing' && pair.inferred) return undefined;
  if (a.mode === 'inferred' && !pair.inferred) return undefined;
  let s = t.priority;
  if (a.cs) {
    if (!a.cs.includes(pair.cs)) return undefined;
    s += 3;
  }
  if (a.signalsAny) {
    const ok = a.signalsAny.some(
      (x) => item.signals.includes(x) || item.problemTypes.includes(x as ProblemType),
    );
    if (!ok) return undefined;
    s += 1;
  }
  if (a.chemBonus?.includes(pair.chem)) s += 1;
  // Deterministic tie-break so similar items do not all get the same template.
  return s + (fnv1a32(item.id + t.id) % 100) / 1000;
}

function signalsText(item: IdeaSubject, rules: Rules): I18nText {
  const comps = rules.scoring.components;
  const labels: I18nText[] = [];
  for (const r of comps.dataIntensity.rules)
    if (item.signals.includes(r.id)) labels.push(lower(r.label));
  if (labels.length < 2)
    for (const r of comps.problemType.rules)
      if (item.problemTypes.includes(r.id as ProblemType)) labels.push(lower(r.label));
  const pick = labels.slice(0, 2);
  if (!pick.length)
    return { tr: 'deneysel/hesaplamalı sonuçları', en: 'experimental/computational results' };
  const and = rules.ideas.joiners.and;
  return pick.length === 1
    ? pick[0]!
    : { tr: pick[0]!.tr + and.tr + pick[1]!.tr, en: pick[0]!.en + and.en + pick[1]!.en };
}

function daysBetween(a: string, now: Date): number {
  return Math.max(0, Math.round((now.getTime() - Date.parse(`${a}T00:00:00Z`)) / 86_400_000));
}

function whyNow(
  item: IdeaSubject,
  pair: Pair,
  ctx: IdeaContext,
  rules: Rules,
  cellLabel: I18nText,
): I18nText[] {
  const w = rules.ideas.whyNow;
  const out: I18nText[] = [];
  const stat = ctx.cellStat?.(pair.chem, pair.cs);
  if (stat?.rising) {
    out.push(
      fill(w.rising!, {
        cell: cellLabel,
        weeks: both(String(ctx.recentWeeks ?? 4)),
        recent: both(String(stat.recent)),
        growth: both(stat.growth.toFixed(1)),
      }),
    );
  } else if (stat?.quietPromising) {
    out.push(
      fill(w.quiet!, {
        cell: cellLabel,
        count: both(String(stat.count)),
        avg: both(stat.avgScore.toFixed(0)),
      }),
    );
  }
  if (item.signals.includes('artifact.code') || item.signals.includes('artifact.codeAvailable'))
    out.push(w.code!);
  else if (
    item.signals.includes('artifact.data') ||
    item.signals.includes('artifact.dataAvailable')
  )
    out.push(w.data!);
  if (pair.inferred) out.push(w.gap!);
  const gh = item.enrichment.github;
  if (gh && gh.total > 0 && out.length < 3)
    out.push(fill(w.github!, { n: both(String(gh.total)) }));
  const days = daysBetween(item.publishedAt, ctx.now ?? new Date());
  if (days <= 90 && out.length < 3) out.push(fill(w.recent!, { days: both(String(days)) }));
  if (item.topics.includes('arxiv:cross-list:chem-cs') && out.length < 3) out.push(w.crossList!);
  return out.slice(0, 3);
}

export function generateIdeas(
  item: IdeaSubject,
  ctx: IdeaContext = {},
  rules: Rules = DEFAULT_RULES,
): Idea[] {
  const max = ctx.max ?? 3;
  const ideas: Idea[] = [];
  const used = new Set<string>();
  const and = rules.ideas.joiners.and;
  const hasCode = item.links.some((l) => l.kind === 'code');

  for (const pair of candidatePairs(item, rules)) {
    if (ideas.length >= max) break;
    const chem = rules.taxonomy.chem.find((n) => n.id === pair.chem);
    const cs = rules.taxonomy.cs.find((n) => n.id === pair.cs);
    if (!chem || !cs) continue;
    let best: { t: IdeaTemplate; s: number } | undefined;
    for (const t of rules.ideas.templates) {
      if (used.has(t.id)) continue;
      const s = templateScore(t, pair, item);
      if (s !== undefined && (!best || s > best.s)) best = { t, s };
    }
    if (!best) continue;
    const t = best.t;
    used.add(t.id);

    const problem = item.problemTypes[0] ?? 'prediction';
    const problemRule = rules.scoring.components.problemType.rules.find((r) => r.id === problem);
    const datasets = chem.datasets.map((d) => d.name);
    const cellLabel: I18nText = {
      tr: `${chem.short.tr} × ${cs.short.tr}`,
      en: `${chem.short.en} × ${cs.short.en}`,
    };
    const stack = [...new Set([...cs.stack.slice(0, 3), ...chem.stack.slice(0, 2)])].slice(0, 5);
    const slots: Slots = {
      title: both(shorten(item.title, 110)),
      shortTitle: both(shorten(item.title, 60)),
      chem: lower(chem.label),
      chemShort: chem.short,
      cs: cs.label,
      csShort: cs.short,
      dataset: both(datasets[0] ?? 'PubChem'),
      datasets: joinList(datasets.slice(0, 2), and),
      baselines: joinList(cs.baselines.slice(0, 2), and),
      metric: rules.ideas.metrics[problem] ?? rules.ideas.metrics.prediction!,
      problem: problemRule ? lower(problemRule.label) : both(problem),
      signals: signalsText(item, rules),
      stack: both(stack.slice(0, 2).join(', ')),
    };

    const dataLinks = item.links.filter((l) => l.kind === 'data').slice(0, 1);
    const requiredData = [
      ...dataLinks.map((l) => ({
        name: l.host + new URL(l.url).pathname.replace(/\/+$/, '').slice(0, 40),
        url: l.url,
      })),
      ...chem.datasets
        .slice(0, 2)
        .map((d) => (d.url ? { name: d.name, url: d.url } : { name: d.name })),
    ];
    const similar: Idea['similar'] = [
      ...(ctx.related ?? [])
        .slice(0, 2)
        .map((r) => ({ title: r.title, url: r.url, kind: 'corpus' as const })),
      ...(item.enrichment.github?.repos ?? [])
        .slice(0, 2)
        .map((r) => ({ title: `${r.name} ★${r.stars}`, url: r.url, kind: 'github' as const })),
      ...(item.enrichment.hn?.stories ?? [])
        .slice(0, 1)
        .map((s) => ({ title: s.title, url: s.hnUrl, kind: 'hn' as const })),
    ];
    let difficulty = t.difficulty + (pair.inferred ? 1 : 0);
    if (
      hasCode &&
      [
        'ood-generalization',
        'reproduce-extend',
        'interpretability',
        'uncertainty-calibration',
      ].includes(t.id)
    )
      difficulty -= 1;

    ideas.push({
      id: `${item.id}:${t.id}:${pair.chem}:${pair.cs}`,
      itemId: item.id,
      templateId: t.id,
      direction: rules.ideas.direction,
      layer: 'A',
      cell: pair,
      title: fill(t.title, slots),
      summary: fill(t.summary, slots),
      researchQuestion: fill(t.researchQuestion, slots),
      method: t.method.map((m) => fill(m, slots)),
      evaluation: fill(t.evaluation, slots),
      difficulty: Math.max(1, Math.min(5, difficulty)),
      requiredData,
      stack,
      whyNow: whyNow(item, pair, ctx, rules, cellLabel),
      venues: [...new Set([...cs.venues.slice(0, 2), ...chem.venues.slice(0, 1)])].slice(0, 3),
      similar,
    });
  }
  return ideas;
}
