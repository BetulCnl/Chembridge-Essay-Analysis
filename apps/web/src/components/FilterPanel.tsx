import type { DevelopmentType, IndexEntry } from '@chembridge/core';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { useMemo, type ReactNode } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { DEFAULT_FILTERS, isoDaysAgo, type FeedFilters, type SortKey } from '../lib/filters.ts';
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
import { Popover } from './common.tsx';

interface Props {
  filters: FeedFilters;
  onChange: (f: FeedFilters) => void;
  rows: IndexEntry[];
  sorts: SortKey[];
}

function toggle<T>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

const TYPES: DevelopmentType[] = ['preprint', 'article', 'news'];
const PRESETS = [7, 30, 90] as const;

function Trigger({ label, count }: { label: string; count?: number }) {
  return (
    <>
      {label}
      {count ? <span className="num">· {count}</span> : null}
      <ChevronDown size={14} aria-hidden="true" />
    </>
  );
}

function Footer({ onClear, close }: { onClear: () => void; close: () => void }) {
  const { t } = useI18n();
  return (
    <div className="popover-footer">
      <button type="button" className="btn btn-sm btn-quiet" onClick={onClear}>
        {t('common.clear')}
      </button>
      <button type="button" className="btn btn-sm btn-primary" onClick={close}>
        {t('common.done')}
      </button>
    </div>
  );
}

function CheckOption({
  checked,
  onChange,
  children,
  count,
  title,
}: {
  checked: boolean;
  onChange: () => void;
  children: ReactNode;
  count?: number;
  title?: string;
}) {
  const { formatNumber } = useI18n();
  return (
    <label className="check" title={title}>
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span>{children}</span>
      {count !== undefined && <span className="count">{formatNumber(count)}</span>}
    </label>
  );
}

/** Horizontal filter bar: one compact menu per facet, plus sort. */
export function FilterBar({ filters: f, onChange, rows, sorts }: Props) {
  const { t, pick } = useI18n();
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
  const chemIds = CHEM_IDS.filter((c) => counts.chem.get(c) || f.chem.includes(c)).sort(
    (a, b) => (counts.chem.get(b) ?? 0) - (counts.chem.get(a) ?? 0),
  );
  const csIds = CS_IDS.filter((c) => counts.cs.get(c) || f.cs.includes(c)).sort(
    (a, b) => (counts.cs.get(b) ?? 0) - (counts.cs.get(a) ?? 0),
  );
  const moreCount =
    Number(f.minScore > 0) + Number(f.code) + Number(f.data) + Number(f.types.length > 0);

  return (
    <div className="filter-bar" role="group" aria-label={t('feed.filters')}>
      <Popover
        label={t('feed.date')}
        active={Boolean(f.from || f.to)}
        trigger={<Trigger label={t('feed.date')} />}
      >
        {(close) => (
          <>
            <div className="preset-row" role="group" aria-label={t('feed.date')}>
              {PRESETS.map((d) => {
                const from = isoDaysAgo(d);
                return (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={f.from === from && !f.to}
                    onClick={() => set({ from, to: '' })}
                  >
                    {t(`feed.preset.${d}`)}
                  </button>
                );
              })}
              <button
                type="button"
                aria-pressed={!f.from && !f.to}
                onClick={() => set({ from: '', to: '' })}
              >
                {t('common.all')}
              </button>
            </div>
            <div className="date-grid">
              <label className="field">
                <span className="field-label">{t('feed.date.from')}</span>
                <input
                  className="input"
                  type="date"
                  value={f.from}
                  onChange={(e) => set({ from: e.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">{t('feed.date.to')}</span>
                <input
                  className="input"
                  type="date"
                  value={f.to}
                  onChange={(e) => set({ to: e.target.value })}
                />
              </label>
            </div>
            <Footer onClear={() => set({ from: '', to: '' })} close={close} />
          </>
        )}
      </Popover>

      <Popover
        label={t('feed.chem')}
        active={f.chem.length > 0}
        trigger={<Trigger label={t('feed.chem')} count={f.chem.length} />}
      >
        {(close) => (
          <>
            <div className="option-grid cols-2">
              {chemIds.map((c) => (
                <CheckOption
                  key={c}
                  checked={f.chem.includes(c)}
                  onChange={() => set({ chem: toggle(f.chem, c) })}
                  count={counts.chem.get(c) ?? 0}
                  title={pick(chemLabel(c))}
                >
                  {pick(chemShort(c))}
                </CheckOption>
              ))}
            </div>
            <Footer onClear={() => set({ chem: [] })} close={close} />
          </>
        )}
      </Popover>

      <Popover
        label={t('feed.cs')}
        active={f.cs.length > 0}
        trigger={<Trigger label={t('feed.cs')} count={f.cs.length} />}
      >
        {(close) => (
          <>
            <div className="option-grid cols-2">
              {csIds.map((c) => (
                <CheckOption
                  key={c}
                  checked={f.cs.includes(c)}
                  onChange={() => set({ cs: toggle(f.cs, c) })}
                  count={counts.cs.get(c) ?? 0}
                  title={pick(csLabel(c))}
                >
                  {pick(csShort(c))}
                </CheckOption>
              ))}
            </div>
            <div className="popover-section">
              <CheckOption checked={f.inferred} onChange={() => set({ inferred: !f.inferred })}>
                {t('feed.includeInferred')}
              </CheckOption>
            </div>
            <Footer onClear={() => set({ cs: [], inferred: false })} close={close} />
          </>
        )}
      </Popover>

      <Popover
        label={t('feed.source')}
        active={f.sources.length > 0}
        trigger={<Trigger label={t('feed.source')} count={f.sources.length} />}
      >
        {(close) => (
          <>
            <div className="option-list">
              {sources.map(([s, n]) => (
                <CheckOption
                  key={s}
                  checked={f.sources.includes(s)}
                  onChange={() => set({ sources: toggle(f.sources, s) })}
                  count={n}
                >
                  {sourceName(s)}
                </CheckOption>
              ))}
            </div>
            <Footer onClear={() => set({ sources: [] })} close={close} />
          </>
        )}
      </Popover>

      <Popover
        label={t('feed.more')}
        active={moreCount > 0}
        trigger={
          <>
            <SlidersHorizontal size={14} aria-hidden="true" />
            <Trigger label={t('feed.more')} count={moreCount} />
          </>
        }
      >
        {(close) => (
          <>
            <div className="popover-section">
              <label className="field">
                <span className="field-label">{t('feed.minScore', { n: f.minScore })}</span>
                <input
                  type="range"
                  min={0}
                  max={90}
                  step={5}
                  value={f.minScore}
                  onChange={(e) => set({ minScore: Number(e.target.value) })}
                />
              </label>
            </div>
            <div className="popover-section">
              <CheckOption checked={f.code} onChange={() => set({ code: !f.code })}>
                {t('feed.onlyCode')}
              </CheckOption>
              <CheckOption checked={f.data} onChange={() => set({ data: !f.data })}>
                {t('feed.onlyData')}
              </CheckOption>
            </div>
            <fieldset className="popover-section" style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="popover-title">{t('feed.type')}</legend>
              {TYPES.map((ty) => (
                <CheckOption
                  key={ty}
                  checked={f.types.includes(ty)}
                  onChange={() => set({ types: toggle(f.types, ty) })}
                >
                  {t(`common.${ty}`)}
                </CheckOption>
              ))}
            </fieldset>
            <Footer
              onClear={() => set({ minScore: 0, code: false, data: false, types: [] })}
              close={close}
            />
          </>
        )}
      </Popover>

      <span className="spacer" />
      <label className="sort-select">
        {t('feed.sort')}
        <select
          value={f.sort}
          onChange={(e) => onChange({ ...f, sort: e.target.value as SortKey })}
        >
          {sorts.map((s) => (
            <option key={s} value={s}>
              {t(`feed.sort.${s}`)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

/** Removable summary of the active filters, shown under the bar. */
export function ActiveFilters({
  filters: f,
  onChange,
}: {
  filters: FeedFilters;
  onChange: (f: FeedFilters) => void;
}) {
  const { t, pick, formatDate } = useI18n();
  const set = (patch: Partial<FeedFilters>) => onChange({ ...f, ...patch });
  const chips: Array<{ key: string; label: string; remove: () => void }> = [];
  if (f.from && f.to)
    chips.push({
      key: 'date',
      label: `${formatDate(f.from)} – ${formatDate(f.to)}`,
      remove: () => set({ from: '', to: '' }),
    });
  else if (f.from)
    chips.push({
      key: 'from',
      label: t('feed.chip.from', { d: formatDate(f.from) }),
      remove: () => set({ from: '' }),
    });
  else if (f.to)
    chips.push({
      key: 'to',
      label: t('feed.chip.to', { d: formatDate(f.to) }),
      remove: () => set({ to: '' }),
    });
  for (const c of f.chem)
    chips.push({
      key: `chem-${c}`,
      label: pick(chemShort(c)),
      remove: () => set({ chem: f.chem.filter((x) => x !== c) }),
    });
  for (const c of f.cs)
    chips.push({
      key: `cs-${c}`,
      label: pick(csShort(c)),
      remove: () => set({ cs: f.cs.filter((x) => x !== c) }),
    });
  if (f.inferred)
    chips.push({
      key: 'inferred',
      label: t('feed.chip.inferred'),
      remove: () => set({ inferred: false }),
    });
  for (const s of f.sources)
    chips.push({
      key: `src-${s}`,
      label: sourceName(s),
      remove: () => set({ sources: f.sources.filter((x) => x !== s) }),
    });
  for (const ty of f.types)
    chips.push({
      key: `type-${ty}`,
      label: t(`common.${ty}`),
      remove: () => set({ types: f.types.filter((x) => x !== ty) }),
    });
  if (f.minScore)
    chips.push({
      key: 'min',
      label: t('feed.chip.minScore', { n: f.minScore }),
      remove: () => set({ minScore: 0 }),
    });
  if (f.code)
    chips.push({ key: 'code', label: t('common.code'), remove: () => set({ code: false }) });
  if (f.data)
    chips.push({ key: 'data', label: t('common.data'), remove: () => set({ data: false }) });

  if (!chips.length) return null;
  return (
    <div className="active-filters">
      {chips.map((c) => (
        <button
          key={c.key}
          type="button"
          className="filter-chip"
          aria-label={t('feed.removeFilter', { f: c.label })}
          onClick={c.remove}
        >
          {c.label}
          <X size={13} aria-hidden="true" />
        </button>
      ))}
      <button
        type="button"
        className="link-btn"
        onClick={() => onChange({ ...DEFAULT_FILTERS, q: f.q, sort: f.sort })}
      >
        {t('feed.clearAll')}
      </button>
    </div>
  );
}
