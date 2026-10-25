import { describe, expect, it } from 'vitest';
import { analyzeDevelopment } from '../src/analyze.ts';
import { generateIdeas, type IdeaSubject } from '../src/ideas.ts';
import { DEFAULT_RULES } from '../src/rules.ts';
import type { CellStat } from '../src/schema.ts';

function subject(title: string, abstract: string, extra: Partial<IdeaSubject> = {}): IdeaSubject {
  const links = extra.links ?? [];
  const a = analyzeDevelopment({
    title,
    abstract,
    topics: [],
    venue: 'ChemRxiv',
    keywords: [],
    links,
    chemistrySource: true,
  });
  return {
    id: 'item1',
    title,
    publishedAt: '2026-10-10',
    url: 'https://doi.org/10.1/x',
    topics: [],
    chem: a.chem,
    cs: a.cs,
    cells: a.cells,
    problemTypes: a.problemTypes,
    signals: a.signals,
    links,
    enrichment: {},
    ...extra,
  };
}

const PLACEHOLDER = /\{[a-zA-Z]+\}/;

describe('generateIdeas (Layer A)', () => {
  const item = subject(
    'Message-passing neural networks predict solvation free energies of drug-like molecules',
    'We train a graph neural network on 640,000 molecules to predict solvation free energies for drug discovery. Code is open-source.',
    { links: [{ url: 'https://github.com/x/y', kind: 'code', host: 'github.com' }] },
  );
  const ideas = generateIdeas(item, { now: new Date('2026-10-24T00:00:00Z') });

  it('returns up to three distinct, fully filled academic ideas', () => {
    expect(ideas.length).toBe(3);
    expect(new Set(ideas.map((i) => i.templateId)).size).toBe(3);
    for (const idea of ideas) {
      expect(idea.direction).toBe('academic');
      expect(idea.layer).toBe('A');
      for (const t of [
        idea.title,
        idea.summary,
        idea.researchQuestion,
        idea.evaluation,
        ...idea.method,
      ]) {
        expect(t.tr).not.toMatch(PLACEHOLDER);
        expect(t.en).not.toMatch(PLACEHOLDER);
        expect(t.tr.length).toBeGreaterThan(10);
      }
      expect(idea.difficulty).toBeGreaterThanOrEqual(1);
      expect(idea.difficulty).toBeLessThanOrEqual(5);
      expect(idea.requiredData.length).toBeGreaterThan(0);
      expect(idea.stack.length).toBeGreaterThan(0);
      expect(idea.venues.length).toBeGreaterThan(0);
    }
  });

  it('starts every generated sentence with a capital letter (Turkish-aware)', () => {
    for (const i of ideas) {
      expect(i.evaluation.tr.charAt(0)).toBe(i.evaluation.tr.charAt(0).toLocaleUpperCase('tr'));
      expect(i.evaluation.en.charAt(0)).toBe(i.evaluation.en.charAt(0).toUpperCase());
    }
  });

  it('builds data-driven "why now" bullets', () => {
    const why = ideas.flatMap((i) => i.whyNow.map((w) => w.en)).join(' ');
    expect(why).toMatch(/Code is public/);
    expect(why).toMatch(/Published 14 days ago/);
  });

  it('uses trend statistics when available', () => {
    const stat: CellStat = {
      chem: 'drug',
      cs: 'gnn',
      count: 40,
      countExisting: 40,
      countInferred: 0,
      avgScore: 55,
      maxScore: 80,
      recent: 12,
      previous: 4,
      growth: 2.6,
      weekly: [],
      rising: true,
      quietPromising: false,
      topIds: [],
    };
    const withTrend = generateIdeas(item, {
      now: new Date('2026-10-24'),
      cellStat: (c, s) => (c === 'drug' && s === 'gnn' ? stat : undefined),
    });
    expect(withTrend.flatMap((i) => i.whyNow.map((w) => w.en)).join(' ')).toMatch(
      /rising: 12 items/,
    );
  });

  it('is deterministic', () => {
    expect(generateIdeas(item, { now: new Date('2026-10-24') })).toEqual(
      generateIdeas(item, { now: new Date('2026-10-24') }),
    );
  });

  it('suggests applying a CS technique to chemistry that does not use one yet', () => {
    const plain = subject(
      'High-throughput screening of electrolyte additives for lithium metal batteries',
      'We screen 400 additives in coin cells and optimize cycle life.',
    );
    const out = generateIdeas(plain, { now: new Date('2026-10-24') });
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((i) => i.cell.inferred)).toBe(true);
    expect(out.flatMap((i) => i.whyNow.map((w) => w.en)).join(' ')).toMatch(/no CS treatment yet/);
  });

  it('has a template for every CS sub-field', () => {
    for (const cs of DEFAULT_RULES.taxonomy.cs) {
      const t = DEFAULT_RULES.ideas.templates.filter(
        (x) => !x.appliesTo.cs || x.appliesTo.cs.includes(cs.id),
      );
      expect(t.length, cs.id).toBeGreaterThan(0);
    }
  });
});
