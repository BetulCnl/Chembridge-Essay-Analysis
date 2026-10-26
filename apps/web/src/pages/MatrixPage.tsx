import type { IndexEntry, Trends } from '@chembridge/core';
import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MousePointerClick } from 'lucide-react';
import { Async, EmptyState, ScoreBadge } from '../components/common.tsx';
import { useI18n } from '../i18n/index.tsx';
import { loadIndex, loadTrends, useAsync } from '../lib/data.ts';
import { CHEM_IDS, chemLabel, chemShort, CS_IDS, csLabel, csShort } from '../lib/labels.ts';

type Metric = 'count' | 'avgScore';
const STEPS = 7;

interface CellAgg {
  chem: string;
  cs: string;
  existing: IndexEntry[];
  inferred: IndexEntry[];
}

export default function MatrixPage() {
  const state = useAsync(() => Promise.all([loadIndex(), loadTrends()]), []);
  return <Async state={state}>{([rows, trends]) => <Matrix rows={rows} trends={trends} />}</Async>;
}

function aggregate(rows: IndexEntry[]): Map<string, CellAgg> {
  const cells = new Map<string, CellAgg>();
  for (const r of rows) {
    const used = new Set(r.cs);
    for (const key of r.cells) {
      const [chem, cs] = key.split('|') as [string, string];
      let c = cells.get(key);
      if (!c) cells.set(key, (c = { chem, cs, existing: [], inferred: [] }));
      (used.has(cs) ? c.existing : c.inferred).push(r);
    }
  }
  return cells;
}

function Matrix({ rows, trends }: { rows: IndexEntry[]; trends: Trends }) {
  const { t, pick, formatNumber, formatDate } = useI18n();
  const [metric, setMetric] = useState<Metric>('count');
  const [withInferred, setWithInferred] = useState(true);
  const [selected, setSelected] = useState<string | undefined>();
  const [focus, setFocus] = useState<[number, number]>([0, 0]);
  const [hover, setHover] = useState<string | undefined>();
  const gridRef = useRef<HTMLTableElement>(null);

  const cells = useMemo(() => aggregate(rows), [rows]);
  const flags = useMemo(() => new Map(trends.cells.map((c) => [`${c.chem}|${c.cs}`, c])), [trends]);

  const items = (c: CellAgg | undefined) =>
    c ? (withInferred ? [...c.existing, ...c.inferred] : c.existing) : [];
  const valueOf = (c: CellAgg | undefined): number => {
    const list = items(c);
    if (!list.length) return 0;
    return metric === 'count' ? list.length : list.reduce((s, x) => s + x.score, 0) / list.length;
  };

  const chemRows = CHEM_IDS.filter((ch) =>
    CS_IDS.some((cs) => items(cells.get(`${ch}|${cs}`)).length > 0),
  );
  const values = chemRows
    .flatMap((ch) => CS_IDS.map((cs) => valueOf(cells.get(`${ch}|${cs}`))))
    .filter((v) => v > 0);
  const max = Math.max(1, ...values);
  const min = metric === 'avgScore' ? Math.min(...values, max) : 1;
  // Counts are heavily skewed, so they use a log scale; average scores are linear.
  const step = (v: number): number => {
    if (v <= 0) return 0;
    const f =
      metric === 'count'
        ? Math.log1p(v) / Math.log1p(max)
        : max === min
          ? 1
          : (v - min) / (max - min);
    return Math.max(1, Math.min(STEPS, Math.ceil(f * STEPS)));
  };
  const fmt = (v: number) => (metric === 'count' ? formatNumber(v) : v.toFixed(0));

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, r: number, c: number) => {
    const moves: Record<string, [number, number]> = {
      ArrowUp: [-1, 0],
      ArrowDown: [1, 0],
      ArrowLeft: [0, -1],
      ArrowRight: [0, 1],
    };
    let next: [number, number] | undefined;
    if (moves[e.key])
      next = [
        Math.max(0, Math.min(chemRows.length - 1, r + moves[e.key]![0])),
        Math.max(0, Math.min(CS_IDS.length - 1, c + moves[e.key]![1])),
      ];
    else if (e.key === 'Home') next = [r, 0];
    else if (e.key === 'End') next = [r, CS_IDS.length - 1];
    if (!next) return;
    e.preventDefault();
    setFocus(next);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-pos="${next[0]}-${next[1]}"]`)
      ?.focus();
  };

  const sel = selected ? cells.get(selected) : undefined;
  const selItems = items(sel).sort((a, b) => b.score - a.score);
  const [selChem, selCs] = (selected ?? '|').split('|') as [string, string];
  const hoverCell = hover ? cells.get(hover) : undefined;
  const [hChem, hCs] = (hover ?? '|').split('|') as [string, string];
  const hoverStat = hover ? flags.get(hover) : undefined;

  return (
    <>
      <header className="page-head">
        <h1>{t('matrix.title')}</h1>
        <p className="lead">{t('matrix.intro')}</p>
      </header>
      <div className="matrix-controls">
        <div className="segmented" role="group" aria-label={t('matrix.metric')}>
          {(['count', 'avgScore'] as Metric[]).map((m) => (
            <button key={m} type="button" aria-pressed={metric === m} onClick={() => setMetric(m)}>
              {t(`matrix.metric.${m}`)}
            </button>
          ))}
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={withInferred}
            onChange={(e) => setWithInferred(e.target.checked)}
          />
          {t('matrix.includeInferred')}
        </label>
        <span className="legend" aria-hidden="true">
          <span className="num">{metric === 'count' ? '1' : min.toFixed(0)}</span>
          <span className="legend-ramp">
            {Array.from({ length: STEPS }, (_, k) => (
              <i key={k} style={{ background: `var(--heat-${k + 1})` }} />
            ))}
          </span>
          <span className="num">{fmt(max)}</span>
        </span>
        <span className="legend">{t('matrix.markers')}</span>
      </div>
      <div className="matrix-layout">
        <div className="card" style={{ overflow: 'hidden' }}>
          <div className="matrix-wrap">
            <table className="matrix" ref={gridRef} aria-label={t('matrix.title')}>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="sr-only">{t('feed.chem')}</span>
                  </th>
                  {CS_IDS.map((cs) => (
                    <th key={cs} scope="col" title={pick(csLabel(cs))}>
                      <span>{pick(csShort(cs))}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {chemRows.map((ch, r) => (
                  <tr key={ch}>
                    <th scope="row" title={pick(chemLabel(ch))}>
                      {pick(chemShort(ch))}
                    </th>
                    {CS_IDS.map((cs, c) => {
                      const key = `${ch}|${cs}`;
                      const agg = cells.get(key);
                      const v = valueOf(agg);
                      const s = step(v);
                      const f = flags.get(key);
                      const mark = f?.rising ? '▲' : f?.quietPromising ? '◆' : '';
                      const count = items(agg).length;
                      const avg = count ? items(agg).reduce((a, x) => a + x.score, 0) / count : 0;
                      return (
                        <td key={cs}>
                          <button
                            type="button"
                            className="heat-cell"
                            data-pos={`${r}-${c}`}
                            tabIndex={focus[0] === r && focus[1] === c ? 0 : -1}
                            aria-pressed={selected === key}
                            aria-label={
                              t('matrix.cellAria', {
                                chem: pick(chemLabel(ch)),
                                cs: pick(csLabel(cs)),
                                count,
                                avg: avg.toFixed(0),
                              }) +
                              (f?.rising ? `, ${t('matrix.rising')}` : '') +
                              (f?.quietPromising ? `, ${t('matrix.quiet')}` : '')
                            }
                            style={{
                              background: s ? `var(--heat-${s})` : 'var(--heat-0)',
                              color: s ? `var(--heat-ink-${s})` : 'var(--text-2)',
                            }}
                            onClick={() => {
                              setSelected(selected === key ? undefined : key);
                              setFocus([r, c]);
                            }}
                            onKeyDown={(e) => onKeyDown(e, r, c)}
                            onFocus={() => setHover(key)}
                            onBlur={() => setHover(undefined)}
                            onPointerEnter={() => setHover(key)}
                            onPointerLeave={() => setHover(undefined)}
                          >
                            {v > 0 ? fmt(v) : ''}
                            {mark && (
                              <span className="mark" aria-hidden="true">
                                {mark}
                              </span>
                            )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="matrix-status" role="status">
            {hover && hoverCell ? (
              <>
                <strong>
                  {pick(chemShort(hChem))} × {pick(csShort(hCs))}
                </strong>
                {' · '}
                {t('matrix.existing', { n: hoverCell.existing.length })}
                {' · '}
                {t('matrix.inferredCount', { n: hoverCell.inferred.length })}
                {hoverStat && (
                  <>
                    {' · '}
                    {t('trends.recent', { weeks: trends.recentWeeks, n: hoverStat.recent })} (
                    {t('trends.growth', { g: hoverStat.growth.toFixed(1) })})
                  </>
                )}
              </>
            ) : (
              <span className="muted">{t('matrix.keyboard')}</span>
            )}
          </div>
        </div>

        <aside
          className="card card-pad matrix-aside"
          aria-live="polite"
          aria-label={t('matrix.title')}
        >
          {sel && selected ? (
            <>
              <p className="eyebrow">
                {pick(chemLabel(selChem))} × {pick(csLabel(selCs))}
              </p>
              <h2 style={{ marginTop: 4 }}>
                {pick(chemShort(selChem))} × {pick(csShort(selCs))}
              </h2>
              <p className="small muted" style={{ marginTop: 4 }}>
                {t('matrix.existing', { n: sel.existing.length })} ·{' '}
                {t('matrix.inferredCount', { n: sel.inferred.length })}
              </p>
              <Link
                className="btn btn-sm btn-primary"
                style={{ margin: '14px 0 18px' }}
                to={`/?chem=${selChem}&cs=${selCs}${withInferred ? '&inferred=1' : ''}`}
              >
                {t('matrix.showInFeed')}
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
              {selItems.length === 0 ? (
                <p className="muted">{t('matrix.emptyCell')}</p>
              ) : (
                <ul className="mini-list">
                  {selItems.slice(0, 8).map((it) => (
                    <li key={it.id}>
                      <span>
                        <Link to={`/item/${it.id}`}>{it.title}</Link>
                        <span className="sub">
                          {it.venue} · {formatDate(it.date)}
                          {!it.cs.includes(selCs) && ` · ${t('common.potential')}`}
                        </span>
                      </span>
                      <ScoreBadge score={it.score} />
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <EmptyState
              title={t('matrix.selectCell')}
              icon={<MousePointerClick size={24} strokeWidth={1.5} aria-hidden="true" />}
            />
          )}
        </aside>
      </div>
    </>
  );
}
