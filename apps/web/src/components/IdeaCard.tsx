import type { Idea } from '@chembridge/core';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';
import { chemShort, csShort } from '../lib/labels.ts';
import { notebook, useNotebook } from '../lib/notebook.ts';
import { Dots } from './common.tsx';

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
      <div className="chips" style={{ marginBottom: 8 }}>
        <span className="chip">{t('idea.layer', { l: idea.layer })}</span>
        <span className="chip chip-chem">
          {t('idea.cell')}: {pick(chemShort(idea.cell.chem))} × {pick(csShort(idea.cell.cs))}
        </span>
        {idea.cell.inferred && <span className="chip chip-potential">{t('common.potential')}</span>}
        <span className="chip">
          {t('idea.difficulty')}:{' '}
          <Dots n={idea.difficulty} label={t('idea.difficultyValue', { n: idea.difficulty })} />
        </span>
      </div>
      <H>{pick(idea.title)}</H>
      <p>{pick(idea.summary)}</p>
      <div className="idea-section">
        <h4>{t('idea.rq')}</h4>
        <p>{pick(idea.researchQuestion)}</p>
      </div>
      {idea.method.length > 0 && (
        <div className="idea-section">
          <h4>{t('idea.method')}</h4>
          <ol>
            {idea.method.map((m, i) => (
              <li key={i}>{pick(m)}</li>
            ))}
          </ol>
        </div>
      )}
      <div className="idea-section">
        <h4>{t('idea.evaluation')}</h4>
        <p>{pick(idea.evaluation)}</p>
      </div>
      {idea.whyNow.length > 0 && (
        <div className="idea-section">
          <h4>{t('idea.whyNow')}</h4>
          <ul>
            {idea.whyNow.map((w, i) => (
              <li key={i}>{pick(w)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="grid-2 idea-section">
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
            <div className="chips">
              {idea.stack.map((s) => (
                <span key={s} className="chip">
                  {s}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {idea.venues.length > 0 && (
        <div className="idea-section">
          <h4>{t('idea.venues')}</h4>
          <p className="small">{idea.venues.join(' · ')}</p>
        </div>
      )}
      {idea.similar.length > 0 && (
        <div className="idea-section">
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
                <span className="muted small">
                  (
                  {s.kind === 'corpus'
                    ? 'ChemBridge'
                    : s.kind === 'hn'
                      ? 'Hacker News'
                      : s.kind === 'github'
                        ? 'GitHub'
                        : 'source'}
                  )
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="card-actions" style={{ marginTop: 12 }}>
        <button
          type="button"
          className={`btn btn-sm ${saved ? '' : 'btn-primary'}`}
          disabled={saved}
          onClick={() => notebook.save(idea, itemTitle)}
        >
          {saved ? t('idea.saved') : t('idea.save')}
        </button>
      </div>
    </article>
  );
}
