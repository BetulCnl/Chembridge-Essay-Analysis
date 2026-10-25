import type { CellStat, IndexEntry, Trends } from '@chembridge/core';
import { Link } from 'react-router-dom';
import { MiniBars, Sparkline } from '../components/charts.tsx';
import { Async } from '../components/common.tsx';
import { useI18n } from '../i18n/index.tsx';
import { loadIndexById, loadTrends, useAsync } from '../lib/data.ts';
import { chemLabel, chemShort, csShort, csLabel } from '../lib/labels.ts';

export default function TrendsPage() {
  const state = useAsync(() => Promise.all([loadTrends(), loadIndexById()]), []);
  return (
    <Async state={state}>{([trends, byId]) => <TrendsView trends={trends} byId={byId} />}</Async>
  );
}

function CellRow({ c, trends, right }: { c: CellStat; trends: Trends; right: string }) {
  const { pick, t } = useI18n();
  const label = `${pick(chemShort(c.chem))} × ${pick(csShort(c.cs))}`;
  return (
    <li>
      <span>
        <Link to={`/?chem=${c.chem}&cs=${c.cs}&inferred=1`}>
          <strong>{label}</strong>
        </Link>
        <br />
        <span className="small muted">
          {pick(chemLabel(c.chem))} × {pick(csLabel(c.cs))} · {t('trends.count', { n: c.count })} ·{' '}
          {t('trends.avg', { n: c.avgScore.toFixed(0) })}
        </span>
      </span>
      <span style={{ textAlign: 'right' }}>
        <strong className="small">{right}</strong>
        <Sparkline
          values={c.weekly}
          labels={trends.weeks}
          ariaLabel={`${label}: ${t('trends.recent', { weeks: trends.recentWeeks, n: c.recent })}`}
        />
      </span>
    </li>
  );
}

function TrendsView({ trends, byId }: { trends: Trends; byId: Map<string, IndexEntry> }) {
  const { t, pick } = useI18n();
  const rising = trends.cells
    .filter((c) => c.rising)
    .sort((a, b) => b.growth - a.growth || b.recent - a.recent)
    .slice(0, 12);
  const quiet = trends.cells
    .filter((c) => c.quietPromising)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 12);
  const monthlyOf = (prefix: 'chem' | 'cs') =>
    Object.entries(trends.monthly)
      .filter(([k]) => k.startsWith(`${prefix}:`))
      .map(([k, v]) => ({ id: k.slice(prefix.length + 1), v, total: v.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
  return (
    <>
      <h1>{t('trends.title')}</h1>
      <p className="muted">{t('trends.intro', { weeks: trends.recentWeeks })}</p>
      <div className="grid-2 section">
        <section className="panel" aria-labelledby="rising-h">
          <h2 id="rising-h">{t('trends.rising')}</h2>
          {rising.length ? (
            <ul className="trend-list">
              {rising.map((c) => (
                <CellRow
                  key={`${c.chem}|${c.cs}`}
                  c={c}
                  trends={trends}
                  right={`${t('trends.growth', { g: c.growth.toFixed(1) })} · ${c.recent}`}
                />
              ))}
            </ul>
          ) : (
            <p className="muted">{t('trends.risingEmpty')}</p>
          )}
        </section>
        <section className="panel" aria-labelledby="quiet-h">
          <h2 id="quiet-h">{t('trends.quiet')}</h2>
          <p className="small muted">{t('trends.quietHint')}</p>
          {quiet.length ? (
            <ul className="trend-list">
              {quiet.map((c) => (
                <CellRow
                  key={`${c.chem}|${c.cs}`}
                  c={c}
                  trends={trends}
                  right={t('trends.avg', { n: c.avgScore.toFixed(0) })}
                />
              ))}
            </ul>
          ) : (
            <p className="muted">{t('trends.quietEmpty')}</p>
          )}
        </section>
      </div>

      <section className="section" aria-labelledby="clusters-h">
        <h2 id="clusters-h">{t('trends.clusters')}</h2>
        <p className="small muted">{t('trends.clustersHint')}</p>
        <div
          className="small-multiples"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}
        >
          {trends.clusters.slice(0, 24).map((cl) => (
            <div key={cl.id}>
              <strong>{cl.label.join(' · ')}</strong>
              <p className="small muted" style={{ margin: '2px 0 6px' }}>
                {t('trends.count', { n: cl.size })} ·{' '}
                {t('trends.avg', { n: cl.avgScore.toFixed(0) })} ·{' '}
                {t('trends.recent', { weeks: 4, n: cl.recent })}
              </p>
              <ul className="small" style={{ margin: 0, paddingLeft: '1.1rem' }}>
                {cl.topIds.slice(0, 3).map((id) => {
                  const e = byId.get(id);
                  return e ? (
                    <li key={id}>
                      <Link to={`/item/${id}`}>
                        {e.title.length > 90 ? e.title.slice(0, 90) + '…' : e.title}
                      </Link>
                    </li>
                  ) : null;
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {(['chem', 'cs'] as const).map((kind) => (
        <section key={kind} className="section" aria-labelledby={`monthly-${kind}`}>
          <h2 id={`monthly-${kind}`}>
            {kind === 'chem' ? t('trends.monthlyChem') : t('trends.monthlyCs')}
          </h2>
          <div className="small-multiples">
            {monthlyOf(kind).map((m) => {
              const label = pick(kind === 'chem' ? chemShort(m.id) : csShort(m.id));
              return (
                <div key={m.id}>
                  <Link to={kind === 'chem' ? `/?chem=${m.id}` : `/?cs=${m.id}`}>
                    <strong className="small">{label}</strong>
                  </Link>{' '}
                  <span className="small muted">{m.total}</span>
                  <div>
                    <MiniBars
                      values={m.v}
                      labels={trends.months}
                      ariaLabel={`${label}: ${trends.months.map((mo, i) => `${mo} ${m.v[i]}`).join(', ')}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
