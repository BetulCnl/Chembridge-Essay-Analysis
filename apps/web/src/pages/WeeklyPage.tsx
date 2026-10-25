import type { IndexEntry, WeeklyDigest } from '@chembridge/core';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Async } from '../components/common.tsx';
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

export default function WeeklyPage() {
  const { week } = useParams();
  const state = useAsync(async () => {
    const weeks = await loadWeeks();
    const current = week ?? weeks[0]?.week;
    const [digest, byId] = await Promise.all([
      current ? loadWeek(current) : Promise.resolve(undefined),
      loadIndexById(),
    ]);
    return { weeks, digest, byId };
  }, [week]);
  return <Async state={state}>{(d) => <Weekly {...d} />}</Async>;
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
      <div className="section-title">
        <h1>{t('weekly.title')}</h1>
        <a className="btn btn-sm" href={dataUrl('feed.xml')}>
          RSS · {t('weekly.rss')}
        </a>
      </div>
      <p className="muted">{t('weekly.intro')}</p>
      <label className="field" style={{ maxWidth: 360 }}>
        <span>{t('nav.weekly')}</span>
        <select
          className="input"
          value={digest?.week ?? ''}
          onChange={(e) => navigate(`/weekly/${e.target.value}`)}
        >
          {weeks.map((w) => (
            <option key={w.week} value={w.week}>
              {w.week} · {t('weekly.weekOf', { from: formatDate(w.from), to: formatDate(w.to) })} ·{' '}
              {t('weekly.total', { n: w.total })}
            </option>
          ))}
        </select>
      </label>
      {!digest ? (
        <p className="muted">{t('weekly.empty')}</p>
      ) : (
        <div className="detail-grid">
          <section aria-labelledby="top-h">
            <h2 id="top-h">{t('weekly.top')}</h2>
            {digest.topIds.map((id) => {
              const e = byId.get(id);
              return e ? <ItemCard key={id} item={e} /> : null;
            })}
          </section>
          <aside>
            <section className="panel section" aria-labelledby="rising-w">
              <h2 id="rising-w">{t('weekly.rising')}</h2>
              {digest.rising.length ? (
                <ul className="small">
                  {digest.rising.map((c) => (
                    <li key={`${c.chem}|${c.cs}`}>
                      <Link
                        to={`/?chem=${c.chem}&cs=${c.cs}&inferred=1&from=${digest.from}&to=${digest.to}`}
                      >
                        {pick(chemShort(c.chem))} × {pick(csShort(c.cs))}
                      </Link>{' '}
                      <span className="muted">
                        {c.recent} · ×{c.growth.toFixed(1)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{t('trends.risingEmpty')}</p>
              )}
            </section>
            <section className="panel section" aria-labelledby="quiet-w">
              <h2 id="quiet-w">{t('weekly.quiet')}</h2>
              {digest.quiet.length ? (
                <ul className="small">
                  {digest.quiet.map((c) => (
                    <li key={`${c.chem}|${c.cs}`}>
                      {pick(chemShort(c.chem))} × {pick(csShort(c.cs))}{' '}
                      <span className="muted">
                        {c.count} · {t('trends.avg', { n: c.avgScore.toFixed(0) })}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="small muted">{t('trends.quietEmpty')}</p>
              )}
            </section>
            <section className="panel section" aria-labelledby="src-w">
              <h2 id="src-w">{t('weekly.bySource')}</h2>
              <table className="data">
                <tbody>
                  {Object.entries(digest.bySource)
                    .sort((a, b) => b[1] - a[1])
                    .map(([s, n]) => (
                      <tr key={s}>
                        <th scope="row">{sourceName(s)}</th>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {n}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </section>
          </aside>
        </div>
      )}
    </>
  );
}
