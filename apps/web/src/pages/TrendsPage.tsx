import type { CellStat, IndexEntry, Trends } from '@chembridge/core';
import { Link, NavLink } from 'react-router-dom';
import { MiniBars, Sparkline } from '../components/charts.tsx';
import { Async } from '../components/common.tsx';
import { useI18n } from '../i18n/index.tsx';
import { loadIndexById, loadTrends, useAsync } from '../lib/data.ts';
import { chemLabel, chemShort, csShort, csLabel } from '../lib/labels.ts';

/** Shared header for the Trends section (overview and weekly digest). */
export function TrendsHeader({ intro }: { intro: string }) {
  const { t } = useI18n();
  return (
    <>
      <header className="page-head">
        <h1>{t('trends.title')}</h1>
        <p className="lead">{intro}</p>
      </header>
      <nav className="tabs" aria-label={t('trends.title')}>
        <NavLink to="/trends" className={({ isActive }) => (isActive ? 'active' : '')}>
          {t('trends.tab.overview')}
        </NavLink>
        <NavLink to="/weekly" className={({ isActive }) => (isActive ? 'active' : '')}>
          {t('trends.tab.weekly')}
        </NavLink>
      </nav>
    </>
  );
}

export default function TrendsPage() {
  const state = useAsync(() => Promise.all([loadTrends(), loadIndexById()]), []);
  const { t } = useI18n();
  return (
    <>
      <Async state={state}>
        {([trends, byId]) => (
          <>
            <TrendsHeader intro={t('trends.intro', { weeks: trends.recentWeeks })} />
            <TrendsView trends={trends} byId={byId} />
          </>
        )}
      </Async>
    </>
  );
}

function CellRow({ c, trends, metric }: { c: CellStat; trends: Trends; metric: string }) {
  const { pick, t } = useI18n();
  const label = `${pick(chemShort(c.chem))} × ${pick(csShort(c.cs))}`;
  return (
    <li>
      <span style={{ minWidth: 0 }}>
        <Link className="label" to={`/?chem=${c.chem}&cs=${c.cs}&inferred=1`}>
          {label}
        </Link>
        <span className="sub">
          {pick(chemLabel(c.chem))} × {pick(csLabel(c.cs))} · {t('trends.count', { n: c.count })}
        </span>
      </span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="metric">{metric}</span>
        <Sparkline
          values={c.weekly}
          labels={trends.weeks}
          width={96}
          height={28}
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
    .slice(0, 10);
  const quiet = trends.cells
    .filter((c) => c.quietPromising)
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 10);
  const monthlyOf = (prefix: 'chem' | 'cs') =>
    Object.entries(trends.monthly)
      .filter(([k]) => k.startsWith(`${prefix}:`))
      .map(([k, v]) => ({ id: k.slice(prefix.length + 1), v, total: v.reduce((a, b) => a + b, 0) }))
      .sort((a, b) => b.total - a.total);
  return (
    <>
      <div className="grid-2">
        <section className="card card-pad" aria-labelledby="rising-h">
          <div className="section-head" style={{ display: 'block' }}>
            <h2 id="rising-h">{t('trends.rising')}</h2>
            <p style={{ marginTop: 4 }}>{t('trends.risingHint')}</p>
          </div>
          {rising.length ? (
            <ol className="rank-list">
              {rising.map((c) => (
                <CellRow
                  key={`${c.chem}|${c.cs}`}
                  c={c}
                  trends={trends}
                  metric={t('trends.growth', { g: c.growth.toFixed(1) })}
                />
              ))}
            </ol>
          ) : (
            <p className="muted">{t('trends.risingEmpty')}</p>
          )}
        </section>
        <section className="card card-pad" aria-labelledby="quiet-h">
          <div className="section-head" style={{ display: 'block' }}>
            <h2 id="quiet-h">{t('trends.quiet')}</h2>
            <p style={{ marginTop: 4 }}>{t('trends.quietHint')}</p>
          </div>
          {quiet.length ? (
            <ol className="rank-list">
              {quiet.map((c) => (
                <CellRow
                  key={`${c.chem}|${c.cs}`}
                  c={c}
                  trends={trends}
                  metric={t('trends.avg', { n: c.avgScore.toFixed(0) })}
                />
              ))}
            </ol>
          ) : (
            <p className="muted">{t('trends.quietEmpty')}</p>
          )}
        </section>
      </div>

      <section className="section" aria-labelledby="clusters-h">
        <div className="section-head">
          <h2 id="clusters-h">{t('trends.clusters')}</h2>
          <p>{t('trends.clustersHint')}</p>
        </div>
        <div className="cluster-grid">
          {trends.clusters.slice(0, 12).map((cl) => (
            <div key={cl.id} className="card cluster">
              <h3>{cl.label.join(' · ')}</h3>
              <p className="sub">
                {t('trends.count', { n: cl.size })} ·{' '}
                {t('trends.avg', { n: cl.avgScore.toFixed(0) })} ·{' '}
                {t('trends.recent', { weeks: 4, n: cl.recent })}
              </p>
              <ul>
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
          <div className="section-head">
            <h2 id={`monthly-${kind}`}>
              {kind === 'chem' ? t('trends.monthlyChem') : t('trends.monthlyCs')}
            </h2>
          </div>
          <div className="small-multiples">
            {monthlyOf(kind).map((m) => {
              const label = pick(kind === 'chem' ? chemShort(m.id) : csShort(m.id));
              return (
                <div key={m.id}>
                  <div className="head">
                    <Link to={kind === 'chem' ? `/?chem=${m.id}` : `/?cs=${m.id}`}>{label}</Link>
                    <span className="muted num">{m.total}</span>
                  </div>
                  <MiniBars
                    values={m.v}
                    labels={trends.months}
                    ariaLabel={`${label}: ${trends.months.map((mo, i) => `${mo} ${m.v[i]}`).join(', ')}`}
                  />
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
