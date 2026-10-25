import type { IndexEntry, ScoreBreakdown as Score } from '@chembridge/core';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider, type Lang } from '../i18n/index.tsx';
import { en, tr } from '../i18n/strings.ts';
import { ItemCard } from './ItemCard.tsx';
import { ScoreBreakdown } from './ScoreBreakdown.tsx';

afterEach(cleanup);

function wrap(ui: React.ReactNode, lang: Lang = 'tr') {
  return render(
    <I18nProvider lang={lang}>
      <MemoryRouter>{ui}</MemoryRouter>
    </I18nProvider>,
  );
}

const item: IndexEntry = {
  id: 'abc',
  title: 'Equivariant GNNs for single-atom catalysts',
  date: '2026-10-20',
  source: 'arxiv',
  type: 'preprint',
  venue: 'arXiv',
  score: 72,
  chem: ['catalysis'],
  cs: ['gnn'],
  csInferred: ['active-learning'],
  cells: ['catalysis|gnn'],
  code: true,
  data: false,
  bucket: 3,
};

describe('i18n', () => {
  it('has an English string for every Turkish key', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });
});

describe('ItemCard', () => {
  it('renders title link, score, taxonomy chips and the ideas button', () => {
    wrap(<ItemCard item={item} />);
    expect(screen.getByRole('link', { name: item.title })).toHaveProperty(
      'href',
      expect.stringContaining('/item/abc'),
    );
    expect(screen.getByLabelText('Uygunluk: 72/100')).toBeTruthy();
    expect(screen.getByText('Kataliz')).toBeTruthy();
    expect(screen.getByText('GNN')).toBeTruthy();
    expect(screen.getByText('(potansiyel)', { exact: false })).toBeTruthy();
    expect(screen.getByText('Açık kod')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Fikirleri gör' })).toBeTruthy();
  });

  it('switches language', () => {
    wrap(<ItemCard item={item} />, 'en');
    expect(screen.getByRole('link', { name: 'See ideas' })).toBeTruthy();
    expect(screen.getByText('Catalysis')).toBeTruthy();
  });
});

describe('ScoreBreakdown', () => {
  it('lists every reason with its label, matched text, field and points', () => {
    const score: Score = {
      total: 47,
      components: {
        csTechniques: { score: 21, max: 40 },
        dataIntensity: { score: 8, max: 20 },
        openArtifacts: { score: 12, max: 20 },
        problemType: { score: 7, max: 20 },
        penalty: { score: -1, max: 0 },
      },
      reasons: [
        {
          component: 'csTechniques',
          rule: 'gnn',
          match: 'graph neural network',
          field: 'title',
          points: 21,
        },
        {
          component: 'dataIntensity',
          rule: 'data.highThroughput',
          match: 'high-throughput',
          field: 'abstract',
          points: 8,
        },
        {
          component: 'openArtifacts',
          rule: 'artifact.code',
          match: 'https://github.com/x/y',
          field: 'abstract',
          points: 12,
        },
        {
          component: 'problemType',
          rule: 'prediction',
          match: 'predict',
          field: 'abstract',
          points: 7,
        },
        {
          component: 'penalty',
          rule: 'penalty.review',
          match: 'A review',
          field: 'title',
          points: -1,
        },
      ],
      rulesVersion: 1,
    };
    wrap(<ScoreBreakdown score={score} />);
    expect(screen.getByText('Grafik Sinir Ağları', { exact: false })).toBeTruthy();
    expect(screen.getByText('“graph neural network”')).toBeTruthy();
    expect(screen.getByText('+21')).toBeTruthy();
    expect(screen.getByText('Yüksek verimli deney/tarama', { exact: false })).toBeTruthy();
    expect(screen.getByText('-1')).toBeTruthy();
    expect(screen.getByText('21/40')).toBeTruthy();
  });
});
