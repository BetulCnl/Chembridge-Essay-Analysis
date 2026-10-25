import type { DevelopmentType, IndexEntry } from '@chembridge/core';
import { useMemo } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { DEFAULT_FILTERS, isoDaysAgo, type FeedFilters } from '../lib/filters.ts';
import {
  CHEM_IDS,
  chemShort,
  chemLabel,
  CS_IDS,
  csShort,
  csLabel,
  sourceGroup,
  sourceName,
} from '../lib/labels.ts';

interface Props {
  filters: FeedFilters;
  onChange: (f: FeedFilters) => void;
  rows: IndexEntry[];
  id: string;
  hidden: boolean;
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

export function FilterPanel({ filters: f, onChange, rows, id, hidden }: Props) {
  const { t, pick, formatNumber } = useI18n();
  const set = (patch: Partial<FeedFilters>) => onChange({ ...f, ...patch });

  const counts = useMemo(() => {
    const src = new Map<string, number>();
    const chem = new Map<string, number>();
    const cs = new Map<string, number>();
    for (const r of rows) {
      const g = sourceGroup(r.source);
      src.set(g, (src.get(g) ?? 0) + 1);
      for (const c of r.chem) chem.set(c, (chem.get(c) ?? 0) + 1);
      for (const c of f.inferred ? [...r.cs, ...r.csInferred] : r.cs)
        cs.set(c, (cs.get(c) ?? 0) + 1);
    }
    return { src, chem, cs };
  }, [rows, f.inferred]);

  const sources = [...counts.src.entries()].sort((a, b) => b[1] - a[1]);
  const types: DevelopmentType[] = ['preprint', 'article', 'news'];
  const presets = [7, 30, 90] as const;

  return (
    <aside id={id} className="panel filters" aria-label={t('feed.filters')} hidden={hidden}>
      <div className="filter-group">
        <h3>{t('feed.date')}</h3>
        <div className="date-row">
          <label className="field">
            <span>{t('feed.date.from')}</span>
            <input
              className="input"
              type="date"
              value={f.from}
              onChange={(e) => set({ from: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t('feed.date.to')}</span>
            <input
              className="input"
              type="date"
              value={f.to}
              onChange={(e) => set({ to: e.target.value })}
            />
          </label>
        </div>
        <div className="chips" role="group" aria-label={t('feed.date')}>
          {presets.map((d) => {
            const from = isoDaysAgo(d);
            return (
              <button
                key={d}
                type="button"
                className="chip"
                aria-pressed={f.from === from && !f.to}
                onClick={() => set({ from, to: '' })}
              >
                {t(`feed.preset.${d}`)}
              </button>
            );
          })}
          <button
            type="button"
            className="chip"
            aria-pressed={!f.from && !f.to}
            onClick={() => set({ from: '', to: '' })}
          >
            {t('common.all')}
          </button>
        </div>
      </div>

      <div className="filter-group">
        <h3>{t('feed.minScore', { n: f.minScore })}</h3>
        <input
          type="range"
          min={0}
          max={90}
          step={5}
          value={f.minScore}
          aria-label={t('feed.minScore', { n: f.minScore })}
          onChange={(e) => set({ minScore: Number(e.target.value) })}
        />
        <label className="check">
          <input
            type="checkbox"
            checked={f.code}
            onChange={(e) => set({ code: e.target.checked })}
          />
          {t('feed.onlyCode')}
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={f.data}
            onChange={(e) => set({ data: e.target.checked })}
          />
          {t('feed.onlyData')}
        </label>
      </div>

      <fieldset className="filter-group" style={{ border: 0, margin: 0, minWidth: 0 }}>
        <legend className="sr-only">{t('feed.source')}</legend>
        <h3 aria-hidden="true">{t('feed.source')}</h3>
        {sources.map(([s, n]) => (
          <label key={s} className="check">
            <input
              type="checkbox"
              checked={f.sources.includes(s)}
              onChange={() => set({ sources: toggle(f.sources, s) })}
            />
            <span>
              {sourceName(s)} <span className="muted small">({formatNumber(n)})</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="filter-group" style={{ border: 0, margin: 0, minWidth: 0 }}>
        <legend className="sr-only">{t('feed.type')}</legend>
        <h3 aria-hidden="true">{t('feed.type')}</h3>
        <div className="chips">
          {types.map((ty) => (
            <button
              key={ty}
              type="button"
              className="chip"
              aria-pressed={f.types.includes(ty)}
              onClick={() => set({ types: toggle(f.types, ty) })}
            >
              {t(`common.${ty}`)}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="filter-group">
        <h3>{t('feed.chem')}</h3>
        <div className="chips" role="group" aria-label={t('feed.chem')}>
          {CHEM_IDS.filter((c) => counts.chem.get(c) || f.chem.includes(c)).map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              title={pick(chemLabel(c))}
              aria-pressed={f.chem.includes(c)}
              onClick={() => set({ chem: toggle(f.chem, c) })}
            >
              {pick(chemShort(c))} <span className="small">{counts.chem.get(c) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <h3>{t('feed.cs')}</h3>
        <label className="check">
          <input
            type="checkbox"
            checked={f.inferred}
            onChange={(e) => set({ inferred: e.target.checked })}
          />
          {t('feed.includeInferred')}
        </label>
        <div className="chips" role="group" aria-label={t('feed.cs')}>
          {CS_IDS.filter((c) => counts.cs.get(c) || f.cs.includes(c)).map((c) => (
            <button
              key={c}
              type="button"
              className="chip"
              title={pick(csLabel(c))}
              aria-pressed={f.cs.includes(c)}
              onClick={() => set({ cs: toggle(f.cs, c) })}
            >
              {pick(csShort(c))} <span className="small">{counts.cs.get(c) ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="filter-group">
        <button
          type="button"
          className="btn btn-sm"
          onClick={() => onChange({ ...DEFAULT_FILTERS, q: f.q, sort: f.sort })}
        >
          {t('feed.clear')}
        </button>
      </div>
    </aside>
  );
}
