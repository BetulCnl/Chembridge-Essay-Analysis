import type { Idea } from '@chembridge/core';
import { Bookmark, BookmarkCheck, Check } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';
import { chemShort, csShort } from '../lib/labels.ts';
import { notebook, useNotebook } from '../lib/notebook.ts';
import { Disclosure, Dots } from './common.tsx';

const SIMILAR_KIND: Record<Idea['similar'][number]['kind'], string> = {
  corpus: 'ChemBridge',
  hn: 'Hacker News',
  github: 'GitHub',
  source: 'source',
};

/**
 * A research idea: title, summary, research question and "why now" are always visible; method,
 * data, stack, venues and similar work are folded away to keep the page scannable.
 */
export function IdeaCard({
  idea,
  itemTitle,
  headingLevel = 3,
}: {
  idea: Idea;
  itemTitle: string;
  headingLevel?: 3 | 4;
}) {
  const { t, pick } = useI18n();
  const saved = useNotebook().some((e) => e.id === idea.id);
  const H = headingLevel === 3 ? 'h3' : 'h4';
  return (
    <article className="idea">
      <div className="idea-top">
        <div>
          <p className="idea-kicker">
            <span>
              {pick(chemShort(idea.cell.chem))} × {pick(csShort(idea.cell.cs))}
            </span>
            {idea.cell.inferred && (
              <span className="tag tag-potential">{t('idea.potentialCell')}</span>
            )}
            <span>
              {t('idea.difficulty')}{' '}
              <Dots n={idea.difficulty} label={t('idea.difficultyValue', { n: idea.difficulty })} />
            </span>
            {idea.layer !== 'A' && <span>{t('idea.layer', { l: idea.layer })}</span>}
          </p>
          <H className="idea-title">{pick(idea.title)}</H>
        </div>
        <button
          type="button"
          className="btn btn-sm save-btn"
          aria-pressed={saved}
          onClick={() => (saved ? notebook.remove(idea.id) : notebook.save(idea, itemTitle))}
        >
          {saved ? (
            <BookmarkCheck size={15} aria-hidden="true" />
          ) : (
            <Bookmark size={15} aria-hidden="true" />
          )}
          {saved ? t('idea.saved') : t('idea.save')}
        </button>
      </div>
      <p className="idea-summary">{pick(idea.summary)}</p>
      <div className="idea-rq">
        <strong>{t('idea.rq')}</strong>
        {pick(idea.researchQuestion)}
      </div>
      {idea.whyNow.length > 0 && (
        <ul className="idea-why" aria-label={t('idea.whyNow')}>
          {idea.whyNow.map((w, i) => (
            <li key={i}>
              <Check size={14} aria-hidden="true" />
              <span>{pick(w)}</span>
            </li>
          ))}
        </ul>
      )}
      <Disclosure summary={t('idea.details')}>
        <div className="idea-details">
          {idea.method.length > 0 && (
            <div>
              <h4>{t('idea.method')}</h4>
              <ol>
                {idea.method.map((m, i) => (
                  <li key={i}>{pick(m)}</li>
                ))}
              </ol>
            </div>
          )}
          <div>
            <h4>{t('idea.evaluation')}</h4>
            <p>{pick(idea.evaluation)}</p>
          </div>
          <div className="cols">
            {idea.requiredData.length > 0 && (
              <div>
                <h4>{t('idea.data')}</h4>
                <ul>
                  {idea.requiredData.map((d) => (
                    <li key={d.name}>
                      {d.url ? (
                        <a href={d.url} target="_blank" rel="noreferrer noopener">
                          {d.name}
                        </a>
                      ) : (
                        d.name
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {idea.stack.length > 0 && (
              <div>
                <h4>{t('idea.stack')}</h4>
                <div className="tags">
                  {idea.stack.map((s) => (
                    <span key={s} className="tag">
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
          {idea.venues.length > 0 && (
            <div>
              <h4>{t('idea.venues')}</h4>
              <p>{idea.venues.join(' · ')}</p>
            </div>
          )}
          {idea.similar.length > 0 && (
            <div>
              <h4>{t('idea.similar')}</h4>
              <ul>
                {idea.similar.map((s) => (
                  <li key={s.url}>
                    {s.kind === 'corpus' && s.url.startsWith('#/') ? (
                      <Link to={s.url.slice(1)}>{s.title}</Link>
                    ) : (
                      <a href={s.url} target="_blank" rel="noreferrer noopener">
                        {s.title}
                      </a>
                    )}{' '}
                    <span className="muted small">({SIMILAR_KIND[s.kind]})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </Disclosure>
    </article>
  );
}
