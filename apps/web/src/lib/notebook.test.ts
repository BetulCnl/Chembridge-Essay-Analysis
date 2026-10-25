import type { Idea } from '@chembridge/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { notebook } from './notebook.ts';

const t = (s: string) => ({ tr: s, en: s });

function idea(id: string): Idea {
  return {
    id,
    itemId: 'item1',
    templateId: 'ood-generalization',
    direction: 'academic',
    layer: 'A',
    cell: { chem: 'catalysis', cs: 'gnn', inferred: false },
    title: t(`Idea ${id}`),
    summary: t('summary'),
    researchQuestion: t('rq'),
    method: [t('m')],
    evaluation: t('e'),
    difficulty: 2,
    requiredData: [],
    stack: [],
    whyNow: [],
    venues: [],
    similar: [],
  };
}

describe('notebook', () => {
  beforeEach(() => {
    for (const e of notebook.list()) notebook.remove(e.id);
  });

  it('saves once, updates notes/status and persists to localStorage', () => {
    notebook.save(idea('1'), 'Item title');
    notebook.save(idea('1'), 'Item title');
    expect(notebook.list()).toHaveLength(1);
    notebook.update('1', { note: 'try OC22', status: 'exploring' });
    expect(notebook.list()[0]).toMatchObject({
      note: 'try OC22',
      status: 'exploring',
      itemTitle: 'Item title',
    });
    expect(JSON.parse(localStorage.getItem('chembridge.notebook.v1')!)).toHaveLength(1);
  });

  it('exports and re-imports without duplicates', () => {
    notebook.save(idea('1'), 'A');
    notebook.save(idea('2'), 'B');
    const file = notebook.exportJson();
    expect(JSON.parse(file).format).toBe('chembridge-notebook');
    notebook.remove('2');
    expect(notebook.importJson(file)).toBe(1);
    expect(
      notebook
        .list()
        .map((e) => e.id)
        .sort(),
    ).toEqual(['1', '2']);
  });

  it('rejects files that are not notebook exports', () => {
    expect(() => notebook.importJson('{"hello": 1}')).toThrow();
    expect(() => notebook.importJson('not json')).toThrow();
    expect(notebook.importJson('[{"id": 3}]')).toBe(0);
  });
});
