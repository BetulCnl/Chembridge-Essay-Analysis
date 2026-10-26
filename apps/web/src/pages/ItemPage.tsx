import { generateIdeas, type DetailEntry, type IndexEntry, type Trends } from '@chembridge/core';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { IdeaGenerator } from '../ai/IdeaGenerator.tsx';
import {
  Async,
  ChemChip,
  CsChip,
  EmptyState,
  ScoreBadge,
  TypeLabel,
} from '../components/common.tsx';
import { IdeaCard } from '../components/IdeaCard.tsx';
import { ScoreBreakdown } from '../components/ScoreBreakdown.tsx';
import { useI18n } from '../i18n/index.tsx';
import { loadDetail, loadIndexById, loadTrends, NoDataError, useAsync } from '../lib/data.ts';
import { chemLabel, csLabel, sourceName } from '../lib/labels.ts';

export default function ItemPage() {
  const { id = '' } = useParams();
  const state = useAsync(
    () =>
      Promise.all([
        loadDetail(id),
        loadIndexById(),
        loadTrends().catch((e: unknown) =>
          e instanceof NoDataError ? undefined : Promise.reject(e),
        ),
      ]),
    [id],
  );
  const { t } = useI18n();
  return (
    <Async state={state}>
      {([detail, byId, trends]) =>
        detail ? (
          <Detail item={detail} byId={byId} trends={trends} />
        ) : (
          <EmptyState title={t('item.notFound')}>
            <Link className="btn btn-sm" to="/">
              {t('item.back')}
            </Link>
          </EmptyState>
        )
      }
    </Async>
  );
}

function Detail({
  item,
  byId,
  trends,
}: {
  item: DetailEntry;
  byId: Map<string, IndexEntry>;
  trends: Trends | undefined;
}) {
  const { t, pick, formatDate } = useI18n();
  const location = useLocation();

  useEffect(() => {
    document.title = `${item.title} · ChemBridge`;
    if (location.hash === '#ideas') document.getElementById('ideas')?.scrollIntoView();
    else window.scrollTo(0, 0);
    return () => {
      document.title = 'ChemBridge';
    };
  }, [item.title, location.hash]);

  const related = useMemo(
    () => item.related.map((r) => byId.get(r)).filter((r): r is IndexEntry => Boolean(r)),
    [item, byId],
  );
  const ideas = useMemo(() => {
    const stats = new Map((trends?.cells ?? []).map((c) => [`${c.chem}|${c.cs}`, c]));
    return generateIdeas(item, {
      now: new Date(),
      cellStat: (c, s) => stats.get(`${c}|${s}`),
      recentWeeks: trends?.recentWeeks ?? 4,
      related: related
        .slice(0, 3)
        .map((r) => ({ id: r.id, title: r.title, url: `#/item/${r.id}` })),
    });
  }, [item, trends, related]);

  const authors =
    item.authors.length > 6
      ? `${item.authors.slice(0, 6).join(', ')} ${t('item.etAl')}`
      : item.authors.join(', ');
  const e = item.enrichment;
  const primary = sourceName(item.primarySource);
  const hasEnrichment = Boolean(
    e.compounds?.length || e.github?.repos.length || e.hn?.stories.length || e.openalex?.topic,
  );

  return (
    <article>
      <Link className="back-link" to="/">
        <ArrowLeft size={16} aria-hidden="true" /> {t('item.back')}
      </Link>

      <div className="detail">
        <div>
          <header className="detail-head">
            <div className="eyebrow-row">
              {item.chem.map((c) => (
                <ChemChip key={c.id} id={c.id} linked />
              ))}
              {item.cs.map((c) => (
                <CsChip key={c.id} id={c.id} potential={c.inferred} />
              ))}
            </div>
            <h1 className="detail-title">{item.title}</h1>
            <p className="detail-meta">
              <span>{item.venue}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
              <span aria-hidden="true">·</span>
              <TypeLabel type={item.type} />
            </p>
            {authors && (
              <p className="detail-authors">
                <span className="sr-only">{t('item.authors')}: </span>
                {authors}
              </p>
            )}
            <div className="btn-row detail-actions">
              <a
                className="btn btn-primary"
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('common.goToSource')}
                <ExternalLink size={15} aria-hidden="true" />
              </a>
              {item.doi && (
                <a
                  className="btn"
                  href={`https://doi.org/${item.doi}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  DOI
                </a>
              )}
              {item.arxivId && (
                <a
                  className="btn"
                  href={`https://arxiv.org/abs/${item.arxivId}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  arXiv
                </a>
              )}
            </div>
          </header>

          <section className="section" aria-labelledby="abstract-heading">
            <div className="section-head">
              <h2 id="abstract-heading">{t('item.abstract')}</h2>
            </div>
            {item.abstractExcerpt ? (
              <p className="abstract prose" lang="en">
                {item.abstractExcerpt}
              </p>
            ) : (
              <p className="muted">—</p>
            )}
            {e.s2?.tldr && (
              <div className="tldr prose">
                <p className="eyebrow" style={{ marginBottom: 4 }}>
                  {t('item.tldr')}
                </p>
                <p lang="en">{e.s2.tldr}</p>
                <p className="small" style={{ marginTop: 6 }}>
                  <a href={`${e.s2.url}?utm_source=api`} target="_blank" rel="noreferrer noopener">
                    {t('item.tldrAttribution')}
                  </a>
                </p>
              </div>
            )}
            <p className="small muted" style={{ marginTop: 12 }}>
              {t('item.abstractNote')}
            </p>
          </section>

          <section id="ideas" className="section" aria-labelledby="ideas-heading" tabIndex={-1}>
            <div className="section-head">
              <h2 id="ideas-heading">{t('item.ideas')}</h2>
              <p>{t('item.ideasIntro')}</p>
            </div>
            <div className="ideas">
              {ideas.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} itemTitle={item.title} />
              ))}
            </div>
            <IdeaGenerator item={item} seedIdeas={ideas} />
          </section>
        </div>

        <aside className="detail-aside" aria-label={t('item.taxonomy')}>
          <div className="side-block">
            <ScoreBreakdown score={item.score} />
          </div>

          <section className="side-block" aria-labelledby="tax-heading">
            <h2 id="tax-heading">{t('item.taxonomy')}</h2>
            <dl className="kv">
              <dt>{t('item.chemFields')}</dt>
              <dd>{item.chem.map((c) => pick(chemLabel(c.id))).join(', ') || '—'}</dd>
              <dt>{t('item.csFields')}</dt>
              <dd>
                {item.cs
                  .map(
                    (c) => pick(csLabel(c.id)) + (c.inferred ? ` (${t('common.potential')})` : ''),
                  )
                  .join(', ') || '—'}
              </dd>
              {e.openalex?.topic && (
                <>
                  <dt>{t('item.openalex')}</dt>
                  <dd>{e.openalex.topic}</dd>
                </>
              )}
            </dl>
          </section>

          {related.length > 0 && (
            <section className="side-block" aria-labelledby="related-heading">
              <h2 id="related-heading">{t('item.related')}</h2>
              <ul className="mini-list">
                {related.slice(0, 5).map((r) => (
                  <li key={r.id}>
                    <span>
                      <Link to={`/item/${r.id}`}>{r.title}</Link>
                      <span className="sub">
                        {r.venue} · {formatDate(r.date)}
                      </span>
                    </span>
                    <ScoreBadge score={r.score} />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {hasEnrichment && (
            <section className="side-block" aria-labelledby="enrich-heading">
              <h2 id="enrich-heading">{t('item.enrichment')}</h2>
              <ul className="link-list">
                {e.compounds?.map((c) => (
                  <li key={c.cid}>
                    <a href={c.url} target="_blank" rel="noreferrer noopener">
                      {c.title ?? c.name}
                    </a>
                    <span className="sub">
                      PubChem · CID {c.cid}
                      {c.formula && ` · ${c.formula}`}
                    </span>
                  </li>
                ))}
                {e.github?.repos.slice(0, 3).map((r) => (
                  <li key={r.url}>
                    <a href={r.url} target="_blank" rel="noreferrer noopener">
                      {r.name}
                    </a>
                    <span className="sub">GitHub · ★{r.stars}</span>
                  </li>
                ))}
                {e.hn?.stories.slice(0, 2).map((s) => (
                  <li key={s.hnUrl}>
                    <a href={s.hnUrl} target="_blank" rel="noreferrer noopener">
                      {s.title}
                    </a>
                    <span className="sub">
                      Hacker News · {s.points} pts · {s.comments}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="side-block" aria-labelledby="sources-heading">
            <h2 id="sources-heading">{t('item.sources')}</h2>
            <dl className="kv">
              {item.sources.map((s) => (
                <div key={`${s.source}-${s.nativeId}`} style={{ display: 'contents' }}>
                  <dt>{sourceName(s.source)}</dt>
                  <dd className="mono">
                    {s.nativeId.length > 48 ? s.nativeId.slice(0, 48) + '…' : s.nativeId}
                  </dd>
                </div>
              ))}
              {item.license && (
                <>
                  <dt>{t('item.license')}</dt>
                  <dd>
                    {item.license.startsWith('http') ? (
                      <a href={item.license} target="_blank" rel="noreferrer noopener">
                        {item.license.replace(/^https?:\/\/(www\.)?/, '')}
                      </a>
                    ) : (
                      item.license
                    )}
                  </dd>
                </>
              )}
            </dl>
            <p className="small muted" style={{ marginTop: 12 }}>
              {t('item.attribution', { source: primary })}
            </p>
          </section>
        </aside>
      </div>
    </article>
  );
}
