import type { Meta } from '@chembridge/core';
import { Async } from '../components/common.tsx';
import { useI18n } from '../i18n/index.tsx';
import { loadMeta, useAsync } from '../lib/data.ts';
import { sourceName } from '../lib/labels.ts';

export default function AboutPage() {
  const { t } = useI18n();
  const state = useAsync(loadMeta, []);
  return (
    <>
      <header className="page-head">
        <h1>{t('about.title')}</h1>
        <p className="lead">{t('about.what')}</p>
      </header>
      <Async state={state}>{(meta) => <Stats meta={meta} />}</Async>
      <div className="grid-2 section">
        <section aria-labelledby="score-h">
          <h2 id="score-h">{t('about.score')}</h2>
          <p className="prose muted" style={{ marginTop: 8 }}>
            {t('about.scoreText')}
          </p>
        </section>
        <section aria-labelledby="priv-h">
          <h2 id="priv-h">{t('about.privacy')}</h2>
          <p className="prose muted" style={{ marginTop: 8 }}>
            {t('about.privacyText')}
          </p>
        </section>
      </div>
      <Async state={state}>{(meta) => <Status meta={meta} />}</Async>
      <section className="section" aria-labelledby="lic-h">
        <h2 id="lic-h">{t('about.licensing')}</h2>
        <p className="prose muted" style={{ marginTop: 8 }}>
          {t('about.licensingText')}
        </p>
      </section>
    </>
  );
}

function Stats({ meta }: { meta: Meta }) {
  const { t, formatDate, formatNumber } = useI18n();
  const stats = [
    { label: t('about.stat.corpus'), value: formatNumber(meta.counts.corpus) },
    { label: t('about.stat.published'), value: formatNumber(meta.counts.published) },
    { label: t('about.stat.sources'), value: formatNumber(meta.sources.length) },
    { label: t('about.stat.updated'), value: formatDate(meta.generatedAt) },
  ];
  return (
    <div className="stat-row">
      {stats.map((s) => (
        <div key={s.label} className="stat">
          <span className="value">{s.value}</span>
          <span className="label">{s.label}</span>
        </div>
      ))}
    </div>
  );
}

function Status({ meta }: { meta: Meta }) {
  const { t, formatDate, formatNumber } = useI18n();
  return (
    <section className="section" aria-labelledby="src-h">
      <div className="section-head">
        <h2 id="src-h">{t('about.sources')}</h2>
        <p>{t('about.embeddings', { m: meta.embeddings })}</p>
      </div>
      <div className="card table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('about.source')}</th>
              <th scope="col">{t('about.status')}</th>
              <th scope="col" style={{ textAlign: 'right' }}>
                {t('about.fetched')}
              </th>
              <th scope="col">{t('about.window')}</th>
              <th scope="col">{t('about.finished')}</th>
            </tr>
          </thead>
          <tbody>
            {meta.sources.map((s) => (
              <tr key={s.source}>
                <th scope="row">{sourceName(s.source)}</th>
                <td>
                  <span className={`status-dot${s.ok ? '' : ' fail'}`}>
                    {s.ok ? t('about.ok') : t('about.failed')}
                  </span>
                  {s.error && (
                    <div
                      className="small muted"
                      style={{ maxWidth: 360, overflowWrap: 'anywhere' }}
                    >
                      {s.error}
                    </div>
                  )}
                </td>
                <td className="num" style={{ textAlign: 'right' }}>
                  {formatNumber(s.fetched)}
                </td>
                <td className="muted">{s.window ? `${s.window.from} → ${s.window.to}` : '—'}</td>
                <td className="muted">{formatDate(s.finishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta.enrichment && (
        <>
          <h3 style={{ margin: '28px 0 12px', fontSize: '0.875rem' }}>{t('about.enrichment')}</h3>
          <div className="card table-wrap">
            <table className="data">
              <tbody>
                {Object.entries(meta.enrichment).map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{sourceName(k)}</th>
                    <td className="num" style={{ textAlign: 'right' }}>
                      {v.hits}/{v.lookups}
                    </td>
                    <td className="muted" style={{ overflowWrap: 'anywhere' }}>
                      {v.skipped ?? ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
