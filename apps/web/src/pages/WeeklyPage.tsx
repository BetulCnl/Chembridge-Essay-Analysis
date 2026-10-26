import type { IndexEntry, WeeklyDigest } from '@chembridge/core';
import { Rss } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Async, EmptyState } from '../components/common.tsx';
import { ItemCard } from '../components/ItemCard.tsx';
import { useI18n } from '../i18n/index.tsx';
import {
  dataUrl,
  loadIndexById,
  loadWeek,
  loadWeeks,
  useAsync,
  type WeekRef,
} from '../lib/data.ts';
import { chemShort, csShort, sourceName } from '../lib/labels.ts';
import { TrendsHeader } from './TrendsPage.tsx';

export default function WeeklyPage() {
  const { week } = useParams();
  const { t } = useI18n();
  const state = useAsync(async () => {
    const weeks = await loadWeeks();
    const current = week ?? weeks[0]?.week;
    const [digest, byId] = await Promise.all([
      current ? loadWeek(current) : Promise.resolve(undefined),
      loadIndexById(),
    ]);
    return { weeks, digest, byId };
  }, [week]);
  return (
    <>
      <TrendsHeader intro={t('weekly.intro')} />
      <Async state={state}>{(d) => <Weekly {...d} />}</Async>
    </>
  );
}

function Weekly({
  weeks,
  digest,
  byId,
}: {
  weeks: WeekRef[];
  digest: WeeklyDigest | undefined;
  byId: Map<string, IndexEntry>;
}) {
  const { t, pick, formatDate } = useI18n();
  const navigate = useNavigate();
  return (
    <>
      <div className="btn-row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <label className="sort-select">
          {t('weekly.pick')}
          <select
            value={digest?.week ?? ''}
            onChange={(e) => navigate(`/weekly/${e.target.value}`)}
          >
            {weeks.map((w) => (
              <option key={w.week} value={w.week}>
                {t('weekly.weekOf', { from: formatDate(w.from), to: formatDate(w.to) })} ·{' '}
                {t('weekly.total', { n: w.total })}
              </option>
            ))}
          </select>
        </label>
        <a className="btn btn-sm btn-quiet" href={dataUrl('feed.xml')}>
          <Rss size={14} aria-hidden="true" /> {t('weekly.rss')}
        </a>
      </div>
      {!digest ? (
        <EmptyState title={t('weekly.empty')} />
      ) : (
        <div className="detail">
          <section aria-labelledby="top-h">
            <div className="section-head">
              <h2 id="top-h">{t('weekly.top')}</h2>
            </div>
            <ol className="result-list" style={{ listStyle: 'none' }}>
              {digest.topIds.map((id) => {
                const e = byId.get(id);
                return e ? <ItemCard key={id} item={e} /> : null;
              })}
            </ol>
          </section>
          <aside className="detail-aside">
            <section className="side-block" aria-labelledby="rising-w">
              <h2 id="rising-w">{t('weekly.rising')}</h2>
              {digest.rising.length ? (
                <ul className="mini-list">
                  {digest.rising.map((c) => (
                    <li key={`${c.chem}|${c.cs}`}>
                      <Link
                        to={`/?chem=${c.chem}&cs=${c.cs}&inferred=1&from=${digest.from}&to=${digest.to}`}
                      >
                        {pick(chemShort(c.chem))} × {pick(csShort(c.cs))}
                      </Link>
                      <span className="small muted num">
                        {c.recent} · ×{c.growth.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{t('trends.risingEmpty')}</p>
              )}
            </section>
            <section className="side-block" aria-labelledby="quiet-w">
              <h2 id="quiet-w">{t('weekly.quiet')}</h2>
              {digest.quiet.length ? (
                <ul className="mini-list">
                  {digest.quiet.map((c) => (
                    <li key={`${c.chem}|${c.cs}`}>
                      <Link to={`/?chem=${c.chem}&cs=${c.cs}&inferred=1`}>
                        {pick(chemShort(c.chem))} × {pick(csShort(c.cs))}
                      </Link>
                      <span className="small muted num">
                        {t('trends.avg', { n: c.avgScore.toFixed(0) })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{t('trends.quietEmpty')}</p>
              )}
            </section>
            <section className="side-block" aria-labelledby="src-w">
              <h2 id="src-w">{t('weekly.bySource')}</h2>
              <dl className="kv">
                {Object.entries(digest.bySource)
                  .sort((a, b) => b[1] - a[1])
                  .map(([s, n]) => (
                    <div key={s} style={{ display: 'contents' }}>
                      <dt>{sourceName(s)}</dt>
                      <dd className="num" style={{ textAlign: 'right' }}>
                        {n}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
