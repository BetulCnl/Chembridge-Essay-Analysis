import { describe, expect, it } from 'vitest';
import { analyzeDevelopment, type AnalyzeInput } from '../src/analyze.ts';
import { DEFAULT_RULES, ruleLabel, rulesVersion, TAXONOMY } from '../src/rules.ts';

function input(p: Partial<AnalyzeInput>): AnalyzeInput {
  return {
    title: p.title ?? '',
    abstract: p.abstract ?? '',
    topics: p.topics ?? [],
    venue: p.venue ?? 'ChemRxiv',
    keywords: p.keywords ?? [],
    links: p.links ?? [],
    chemistrySource: p.chemistrySource ?? true,
    ...(p.enrichment ? { enrichment: p.enrichment } : {}),
  };
}

describe('rules', () => {
  it('compiles every pattern in the rule files', () => {
    for (const n of [...TAXONOMY.chem, ...TAXONOMY.cs])
      for (const t of n.terms) expect(() => new RegExp(t.re, 'i')).not.toThrow();
    const c = DEFAULT_RULES.scoring.components;
    for (const r of [
      ...c.dataIntensity.rules,
      ...c.openArtifacts.rules,
      ...c.problemType.rules,
      ...DEFAULT_RULES.scoring.penalties,
    ])
      expect(() => new RegExp(r.re, 'i')).not.toThrow();
  });

  it('references only existing CS sub-fields from inference rules, defaults and templates', () => {
    const cs = new Set(TAXONOMY.cs.map((c) => c.id));
    for (const r of DEFAULT_RULES.scoring.inference.rules)
      for (const id of r.cs) expect(cs.has(id), id).toBe(true);
    for (const n of TAXONOMY.chem) for (const id of n.defaultCs) expect(cs.has(id), id).toBe(true);
    for (const t of DEFAULT_RULES.ideas.templates)
      for (const id of t.appliesTo.cs ?? []) expect(cs.has(id), `${t.id}:${id}`).toBe(true);
  });

  it('has bilingual labels for every rule id used in reasons', () => {
    expect(ruleLabel('gnn')?.tr).toBe('Grafik Sinir Ağları');
    expect(ruleLabel('data.highThroughput')?.en).toMatch(/High-throughput/);
    expect(ruleLabel('crossList')).toBeDefined();
    expect(rulesVersion()).toBeGreaterThan(0);
  });
});

describe('analyzeDevelopment', () => {
  const gnnCatalysis = analyzeDevelopment(
    input({
      title: 'Equivariant graph neural networks for single-atom catalyst screening',
      abstract:
        'We screen 12,000 single-atom catalysts for the oxygen evolution reaction using a message-passing GNN trained on DFT adsorption energies. ' +
        'Code is available at https://github.com/example/sac-gnn and data at https://zenodo.org/records/123. We predict activity and discover new candidates.',
      topics: ['arxiv:physics.chem-ph', 'arxiv:cs.LG', 'arxiv:cross-list:chem-cs'],
      links: [
        { url: 'https://github.com/example/sac-gnn', kind: 'code', host: 'github.com' },
        { url: 'https://zenodo.org/records/123', kind: 'data', host: 'zenodo.org' },
      ],
    }),
  );

  it('maps chemistry and CS sub-fields with evidence', () => {
    expect(gnnCatalysis.chem[0]?.id).toBe('catalysis');
    expect(gnnCatalysis.cs[0]).toMatchObject({ id: 'gnn', inferred: false });
    expect(gnnCatalysis.cells[0]).toMatchObject({ chem: 'catalysis', cs: 'gnn', inferred: false });
    expect(gnnCatalysis.relevant).toBe(true);
  });

  it('produces an explainable score: every point has a reason and components respect their caps', () => {
    const s = gnnCatalysis.score;
    const sum = s.reasons.reduce((acc, r) => acc + r.points, 0);
    const capped =
      Math.min(
        40,
        s.reasons.filter((r) => r.component === 'csTechniques').reduce((a, r) => a + r.points, 0),
      ) +
      Math.min(
        20,
        s.reasons.filter((r) => r.component === 'dataIntensity').reduce((a, r) => a + r.points, 0),
      ) +
      Math.min(
        20,
        s.reasons.filter((r) => r.component === 'openArtifacts').reduce((a, r) => a + r.points, 0),
      ) +
      Math.min(
        20,
        s.reasons.filter((r) => r.component === 'problemType').reduce((a, r) => a + r.points, 0),
      );
    expect(sum).toBeGreaterThanOrEqual(capped);
    expect(s.total).toBe(Math.round(capped));
    expect(s.total).toBeGreaterThan(60);
    expect(s.components.csTechniques.score).toBeLessThanOrEqual(40);
    expect(s.reasons.find((r) => r.rule === 'gnn')?.field).toBe('title');
    expect(s.reasons.some((r) => r.rule === 'crossList')).toBe(true);
    expect(s.reasons.some((r) => r.rule === 'artifact.code' && r.points === 12)).toBe(true);
    expect(s.reasons.some((r) => r.rule === 'data.largeCount')).toBe(true);
    expect(gnnCatalysis.problemTypes).toEqual(expect.arrayContaining(['prediction', 'discovery']));
  });

  it('proposes potential (inferred) CS cells for chemistry work that uses no CS yet', () => {
    const a = analyzeDevelopment(
      input({
        title: 'High-throughput optimization of Suzuki cross-coupling yields',
        abstract:
          'We optimize reaction conditions for Suzuki couplings using a high-throughput screening platform with 1536 reactions.',
      }),
    );
    expect(a.cs.every((c) => c.inferred)).toBe(true);
    expect(a.cells.length).toBeGreaterThan(0);
    expect(a.cells.every((c) => c.inferred)).toBe(true);
    expect(a.cs.map((c) => c.id)).toEqual(expect.arrayContaining(['bayesian-opt']));
    expect(a.chem[0]?.id).toBe('synthesis');
  });

  it('rejects CS papers that only mention chemistry in passing', () => {
    const a = analyzeDevelopment(
      input({
        title: 'Benchmarking LLM inference on graphs',
        abstract:
          'We evaluate language models on graph tasks including a drug interaction dataset.',
        chemistrySource: false,
        topics: ['arxiv:cs.LG'],
      }),
    );
    expect(a.relevant).toBe(false);
  });

  it('falls back to General Chemistry for chemistry sources without a sub-field', () => {
    const a = analyzeDevelopment(
      input({ title: 'Odour perception of small molecules', abstract: 'A study.' }),
    );
    expect(a.chem[0]?.id).toBe('general');
    expect(a.relevant).toBe(true);
  });

  it('applies penalties for notices and uses taxonomy hints from source topics', () => {
    const notice = analyzeDevelopment(
      input({
        title: 'Correction to: machine learning for catalysis',
        abstract: 'machine learning catalysis',
      }),
    );
    expect(notice.score.total).toBe(0);
    const hinted = analyzeDevelopment(
      input({
        title: 'Structure of a membrane complex',
        abstract: 'Cryo-EM structure.',
        topics: ['biorxiv:biochemistry'],
      }),
    );
    expect(hinted.chem[0]?.id).toBe('biochem');
    expect(hinted.chem[0]?.evidence).toContain('biorxiv:biochemistry');
  });

  it('adds the GitHub ecosystem signal from enrichment', () => {
    const base = input({
      title: 'Bayesian optimization of perovskite films',
      abstract: 'Bayesian optimization with a Gaussian process.',
    });
    const without = analyzeDevelopment(base).score.total;
    const withGh = analyzeDevelopment({
      ...base,
      enrichment: {
        github: {
          query: 'q',
          total: 7,
          repos: [{ name: 'a/b', url: 'https://github.com/a/b', stars: 3 }],
          checkedAt: '',
        },
      },
    }).score.total;
    expect(withGh).toBe(without + 3);
  });
});
