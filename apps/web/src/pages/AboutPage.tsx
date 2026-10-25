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
      <h1>{t('about.title')}</h1>
      <p style={{ maxWidth: '72ch' }}>{t('about.what')}</p>
      <section className="section panel" aria-labelledby="score-h">
        <h2 id="score-h">{t('about.score')}</h2>
        <p style={{ maxWidth: '72ch' }}>{t('about.scoreText')}</p>
      </section>
      <Async state={state}>{(meta) => <Status meta={meta} />}</Async>
      <section className="section panel" aria-labelledby="lic-h">
        <h2 id="lic-h">{t('about.licensing')}</h2>
        <p style={{ maxWidth: '72ch' }}>{t('about.licensingText')}</p>
      </section>
      <section className="section panel" aria-labelledby="priv-h">
        <h2 id="priv-h">{t('about.privacy')}</h2>
        <p style={{ maxWidth: '72ch' }}>{t('about.privacyText')}</p>
      </section>
    </>
  );
}

function Status({ meta }: { meta: Meta }) {
  const { t, formatDate, formatNumber } = useI18n();
  return (
    <section className="section panel" aria-labelledby="src-h">
      <h2 id="src-h">{t('about.sources')}</h2>
      <p className="small muted">
        {t('about.counts', {
          c: formatNumber(meta.counts.corpus),
          p: formatNumber(meta.counts.published),
        })}{' '}
        · {t('about.embeddings', { m: meta.embeddings })} · {t('common.updated')}:{' '}
        {formatDate(meta.generatedAt)}
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">{t('about.source')}</th>
              <th scope="col">{t('about.status')}</th>
              <th scope="col">{t('about.fetched')}</th>
              <th scope="col">{t('about.window')}</th>
              <th scope="col">{t('about.finished')}</th>
            </tr>
          </thead>
          <tbody>
            {meta.sources.map((s) => (
              <tr key={s.source}>
                <th scope="row">{sourceName(s.source)}</th>
                <td>
                  <span className={s.ok ? 'status-ok' : 'status-fail'}>
                    {s.ok ? `✓ ${t('about.ok')}` : `✕ ${t('about.failed')}`}
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
                <td style={{ fontVariantNumeric: 'tabular-nums' }}>{formatNumber(s.fetched)}</td>
                <td className="small">{s.window ? `${s.window.from} → ${s.window.to}` : '—'}</td>
                <td className="small">{formatDate(s.finishedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {meta.enrichment && (
        <>
          <h3 style={{ marginTop: 16 }}>{t('about.enrichment')}</h3>
          <div className="table-wrap">
            <table className="data">
              <tbody>
                {Object.entries(meta.enrichment).map(([k, v]) => (
                  <tr key={k}>
                    <th scope="row">{sourceName(k)}</th>
                    <td style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {v.hits}/{v.lookups}
                    </td>
                    <td className="small muted" style={{ overflowWrap: 'anywhere' }}>
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
