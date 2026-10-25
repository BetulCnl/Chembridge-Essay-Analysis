import { describe, expect, it } from 'vitest';
import {
  computeTrends,
  isoWeek,
  lastMonths,
  lastWeeks,
  weekRange,
  type TrendItem,
} from '../src/trends.ts';
import { dequantize, dot, hashedTfidf, leaderClusters, quantize, topK } from '../src/similarity.ts';

describe('weeks', () => {
  it('computes ISO weeks and their ranges', () => {
    expect(isoWeek('2026-10-24')).toBe('2026-W43');
    expect(isoWeek('2026-01-01')).toBe('2026-W01');
    expect(isoWeek('2027-01-01')).toBe('2026-W53');
    expect(weekRange('2026-W43')).toEqual({ from: '2026-10-19', to: '2026-10-25' });
  });

  it('lists the last weeks and months ending now', () => {
    const w = lastWeeks(new Date('2026-10-24T12:00:00Z'), 4);
    expect(w).toEqual(['2026-W40', '2026-W41', '2026-W42', '2026-W43']);
    expect(lastMonths(new Date('2026-10-24'), 3)).toEqual(['2026-08', '2026-09', '2026-10']);
  });
});

describe('computeTrends', () => {
  const now = new Date('2026-10-24T12:00:00Z');
  const items: TrendItem[] = [];
  // A rising cell: 2 items a month ago, 8 in the last two weeks.
  for (let i = 0; i < 2; i++)
    items.push({
      id: `old${i}`,
      date: '2026-09-10',
      score: 40,
      cells: [{ chem: 'catalysis', cs: 'gnn', weight: 1, inferred: false }],
      chem: ['catalysis'],
      cs: ['gnn'],
    });
  for (let i = 0; i < 8; i++)
    items.push({
      id: `new${i}`,
      date: '2026-10-20',
      score: 50,
      cells: [{ chem: 'catalysis', cs: 'gnn', weight: 1, inferred: false }],
      chem: ['catalysis'],
      cs: ['gnn'],
    });
  // A big, average cell and a small, high-scoring one.
  for (let i = 0; i < 30; i++)
    items.push({
      id: `b${i}`,
      date: '2026-06-15',
      score: 25,
      cells: [{ chem: 'drug', cs: 'ml', weight: 1, inferred: false }],
      chem: ['drug'],
      cs: ['ml'],
    });
  for (let i = 0; i < 3; i++)
    items.push({
      id: `q${i}`,
      date: '2026-07-01',
      score: 75,
      cells: [{ chem: 'green', cs: 'robotics', weight: 1, inferred: true }],
      chem: ['green'],
      cs: [],
    });

  const t = computeTrends(items, { now });
  const cell = (chem: string, cs: string) => t.cells.find((c) => c.chem === chem && c.cs === cs)!;

  it('counts per cell and per week', () => {
    expect(cell('catalysis', 'gnn').count).toBe(10);
    expect(cell('catalysis', 'gnn').recent).toBe(8);
    expect(cell('green', 'robotics').countInferred).toBe(3);
    expect(t.weeks).toHaveLength(26);
    expect(t.monthly.all!.reduce((a, b) => a + b, 0)).toBe(
      items.filter((i) => i.date >= '2026-05-01').length,
    );
  });

  it('flags rising and quiet-but-promising cells', () => {
    expect(cell('catalysis', 'gnn').rising).toBe(true);
    expect(cell('drug', 'ml').rising).toBe(false);
    expect(cell('green', 'robotics').quietPromising).toBe(true);
    expect(cell('drug', 'ml').quietPromising).toBe(false);
  });
});

describe('similarity', () => {
  const texts = [
    'graph neural network catalyst adsorption energy',
    'graph neural networks for catalyst adsorption energies',
    'protein language model enzyme design',
    'enzyme design with protein language models',
  ];
  const v = hashedTfidf(texts, 512);

  it('finds the nearest neighbour', () => {
    const nn = topK(v, 1, 0);
    expect(nn[0]![0]!.j).toBe(1);
    expect(nn[2]![0]!.j).toBe(3);
  });

  it('clusters similar texts together', () => {
    const a = leaderClusters(v, [0, 1, 2, 3], 0.2);
    expect(a[1]).toBe(a[0]);
    expect(a[3]).toBe(a[2]);
    expect(a[0]).not.toBe(a[2]);
  });

  it('round-trips int8 quantization', () => {
    const back = dequantize(quantize(v[0]!));
    expect(dot(back, v[0]!)).toBeGreaterThan(0.99);
  });
});
