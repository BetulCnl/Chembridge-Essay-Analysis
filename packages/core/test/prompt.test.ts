import { describe, expect, it } from 'vitest';
import { buildIdeaPrompt, parseGeneratedIdeas, type PromptItem } from '../src/prompt.ts';

const item: PromptItem = {
  id: 'x1',
  title: 'Graph neural networks for catalyst discovery',
  venue: 'arXiv',
  publishedAt: '2026-10-01',
  abstractExcerpt: 'We train a GNN on OC20.',
  chem: [{ id: 'catalysis' }],
  cs: [
    { id: 'gnn', inferred: false },
    { id: 'active-learning', inferred: true },
  ],
  problemTypes: ['prediction'],
  signals: [],
};

const idea = {
  title: 'Transfer to electrocatalysis',
  summary: 'Fine-tune on OC22.',
  researchQuestion: 'Does it transfer?',
  method: ['a', 'b', 'c'],
  evaluation: 'MAE',
  difficulty: 7,
  requiredData: ['OC22'],
  stack: ['PyTorch Geometric'],
  whyNow: ['New data'],
};

describe('buildIdeaPrompt', () => {
  it('describes the development, the taxonomy and the language', () => {
    const [system, user] = buildIdeaPrompt(item, [], 'tr');
    expect(system!.role).toBe('system');
    expect(user!.content).toContain('Graph neural networks for catalyst discovery');
    expect(user!.content).toContain('Catalysis');
    expect(user!.content).toContain('CS techniques already used: Graph Neural Networks');
    expect(user!.content).toContain('Potential CS techniques: Active Learning & Uncertainty');
    expect(user!.content).toContain('Write all text in Turkish');
  });
});

describe('parseGeneratedIdeas', () => {
  it('parses a fenced JSON array and clamps difficulty', () => {
    const out = parseGeneratedIdeas(
      'Sure!\n```json\n' + JSON.stringify([idea]) + '\n```',
      item,
      'B',
    )!;
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      layer: 'B',
      difficulty: 5,
      cell: { chem: 'catalysis', cs: 'gnn', inferred: false },
    });
    expect(out[0]!.title.tr).toBe('Transfer to electrocatalysis');
    expect(out[0]!.method).toHaveLength(3);
  });

  it('tolerates trailing commas, smart quotes and an {"ideas": [...]} wrapper', () => {
    const sloppy = '[{“title”: “T”, “summary”: “S”, "method": ["m",],},]';
    expect(parseGeneratedIdeas(sloppy, item, 'C')?.[0]?.summary.en).toBe('S');
    expect(parseGeneratedIdeas(JSON.stringify({ ideas: [idea] }), item, 'C')).toHaveLength(1);
  });

  it('returns undefined when nothing usable is found', () => {
    expect(parseGeneratedIdeas('I cannot help with that.', item, 'B')).toBeUndefined();
    expect(parseGeneratedIdeas('[{"title": "no summary"}]', item, 'B')).toBeUndefined();
  });
});
