import { generateIdeas, type DetailEntry, type IndexEntry, type Trends } from '@chembridge/core';
import { useEffect, useMemo } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { IdeaGenerator } from '../ai/IdeaGenerator.tsx';
import { Async, ChemChip, CsChip, ScoreBadge, TypeLabel } from '../components/common.tsx';
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
          <div className="notice">
            <p>{t('item.notFound')}</p>
            <Link to="/">{t('common.back')}</Link>
          </div>
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
    item.authors.length > 8
      ? `${item.authors.slice(0, 8).join(', ')} ${t('item.etAl')}`
      : item.authors.join(', ');
  const e = item.enrichment;
  const primary = sourceName(item.primarySource);

  return (
    <article>
      <p className="small">
        <Link to="/">← {t('nav.feed')}</Link>
      </p>
      <div className="detail-grid">
        <div>
          <header className="detail-head section">
            <div className="chips" style={{ marginBottom: 10 }}>
              {item.chem.map((c) => (
                <ChemChip key={c.id} id={c.id} linked />
              ))}
              {item.cs.map((c) => (
                <CsChip key={c.id} id={c.id} potential={c.inferred} />
              ))}
            </div>
            <h1>{item.title}</h1>
            <p className="item-meta">
              <span>{item.venue}</span>
              <span aria-hidden="true">·</span>
              <time dateTime={item.publishedAt}>{formatDate(item.publishedAt)}</time>
              <span aria-hidden="true">·</span>
              <TypeLabel type={item.type} />
            </p>
            {authors && (
              <p className="small">
                <span className="muted">{t('item.authors')}:</span> {authors}
              </p>
            )}
            <div className="card-actions">
              <a
                className="btn btn-primary"
                href={item.url}
                target="_blank"
                rel="noreferrer noopener"
              >
                {t('common.goToSource')} ↗
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
                  arXiv:{item.arxivId}
                </a>
              )}
            </div>
          </header>

          <section className="section panel" aria-labelledby="abstract-heading">
            <h2 id="abstract-heading">{t('item.abstract')}</h2>
            {item.abstractExcerpt ? (
              <p lang="en">{item.abstractExcerpt}</p>
            ) : (
              <p className="muted">—</p>
            )}
            <p className="small muted">{t('item.abstractNote')}</p>
            {e.s2?.tldr && (
              <div className="notice" style={{ marginTop: 10 }}>
                <p className="small" style={{ marginBottom: 4 }}>
                  <strong>{t('item.tldr')}</strong>
                </p>
                <p lang="en" style={{ marginBottom: 4 }}>
                  {e.s2.tldr}
                </p>
                <p className="small muted" style={{ margin: 0 }}>
                  <a href={`${e.s2.url}?utm_source=api`} target="_blank" rel="noreferrer noopener">
                    {t('item.tldrAttribution')}
                  </a>
                </p>
              </div>
            )}
          </section>

          <section id="ideas" className="section" aria-labelledby="ideas-heading" tabIndex={-1}>
            <h2 id="ideas-heading">{t('item.ideas')}</h2>
            <p className="small muted">{t('item.ideasIntro')}</p>
            {ideas.map((idea) => (
              <IdeaCard key={idea.id} idea={idea} itemTitle={item.title} />
            ))}
            <IdeaGenerator item={item} seedIdeas={ideas} />
          </section>
        </div>

        <aside aria-label={t('item.taxonomy')}>
          <ScoreBreakdown score={item.score} />

          <section className="panel section" aria-labelledby="tax-heading">
            <h2 id="tax-heading">{t('item.taxonomy')}</h2>
            <h3 className="small muted">{t('item.chemFields')}</h3>
            <ul className="reasons" style={{ marginBottom: 12 }}>
              {item.chem.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{pick(chemLabel(c.id))}</strong>
                    {c.evidence.length > 0 && (
                      <span className="small muted"> — {c.evidence.slice(0, 4).join(', ')}</span>
                    )}
                  </span>
                  <span className="pts">{c.confidence}</span>
                </li>
              ))}
            </ul>
            <h3 className="small muted">{t('item.csFields')}</h3>
            <ul className="reasons">
              {item.cs.map((c) => (
                <li key={c.id}>
                  <span>
                    <strong>{pick(csLabel(c.id))}</strong>{' '}
                    {c.inferred && (
                      <span className="chip chip-potential">{t('common.potential')}</span>
                    )}
                    {c.evidence.length > 0 && !c.inferred && (
                      <span className="small muted"> — “{c.evidence[0]}”</span>
                    )}
                  </span>
                  <span className="pts">{c.confidence}</span>
                </li>
              ))}
            </ul>
          </section>

          {Boolean(
            e.compounds?.length ||
            e.github?.repos.length ||
            e.hn?.stories.length ||
            e.openalex?.topic,
          ) && (
            <section className="panel section" aria-labelledby="enrich-heading">
              <h2 id="enrich-heading">{t('item.enrichment')}</h2>
              {e.openalex?.topic && (
                <p className="small">
                  <span className="muted">{t('item.openalex')}:</span> {e.openalex.topic}
                  {e.openalex.subfield && <span className="muted"> ({e.openalex.subfield})</span>}
                </p>
              )}
              {e.compounds && e.compounds.length > 0 && (
                <>
                  <h3 className="small muted">{t('item.compounds')}</h3>
                  <ul className="small">
                    {e.compounds.map((c) => (
                      <li key={c.cid}>
                        <a href={c.url} target="_blank" rel="noreferrer noopener">
                          {c.title ?? c.name}
                        </a>{' '}
                        {c.formula && <span className="mono">{c.formula}</span>}{' '}
                        <span className="muted">CID {c.cid}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {e.github && e.github.repos.length > 0 && (
                <>
                  <h3 className="small muted">{t('item.github')}</h3>
                  <p className="small muted">
                    {t('item.githubQuery', { q: e.github.query, n: e.github.total })}
                  </p>
                  <ul className="small">
                    {e.github.repos.slice(0, 4).map((r) => (
                      <li key={r.url}>
                        <a href={r.url} target="_blank" rel="noreferrer noopener">
                          {r.name}
                        </a>{' '}
                        <span className="muted">★{r.stars}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
              {e.hn && e.hn.stories.length > 0 && (
                <>
                  <h3 className="small muted">{t('item.hn')}</h3>
                  <ul className="small">
                    {e.hn.stories.slice(0, 3).map((s) => (
                      <li key={s.hnUrl}>
                        <a href={s.hnUrl} target="_blank" rel="noreferrer noopener">
                          {s.title}
                        </a>{' '}
                        <span className="muted">
                          {s.points} pts · {s.comments}
                        </span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}

          {related.length > 0 && (
            <section className="panel section" aria-labelledby="related-heading">
              <h2 id="related-heading">{t('item.related')}</h2>
              <ul className="related-list">
                {related.map((r) => (
                  <li key={r.id}>
                    <ScoreBadge score={r.score} label={false} />
                    <span>
                      <Link to={`/item/${r.id}`}>{r.title}</Link>
                      <br />
                      <span className="small muted">
                        {r.venue} · {formatDate(r.date)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="panel section" aria-labelledby="sources-heading">
            <h2 id="sources-heading">{t('item.sources')}</h2>
            <ul className="small">
              {item.sources.map((s) => (
                <li key={`${s.source}-${s.nativeId}`}>
                  {sourceName(s.source)}{' '}
                  <span className="mono muted">
                    {s.nativeId.length > 60 ? s.nativeId.slice(0, 60) + '…' : s.nativeId}
                  </span>
                </li>
              ))}
            </ul>
            {item.license && (
              <p className="small">
                <span className="muted">{t('item.license')}:</span>{' '}
                {item.license.startsWith('http') ? (
                  <a href={item.license} target="_blank" rel="noreferrer noopener">
                    {item.license.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                ) : (
                  item.license
                )}
              </p>
            )}
            <p className="small muted">{t('item.attribution', { source: primary })}</p>
          </section>
        </aside>
      </div>
    </article>
  );
}
