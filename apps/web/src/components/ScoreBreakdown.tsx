import { SCORING, type ScoreBreakdown as Score, type ScoreComponentId } from '@chembridge/core';
import { useI18n } from '../i18n/index.tsx';
import { csLabel, reasonLabel } from '../lib/labels.ts';
import { ScoreBadge } from './common.tsx';

const COMPONENTS: Array<Exclude<ScoreComponentId, 'penalty'>> = [
  'csTechniques',
  'dataIntensity',
  'openArtifacts',
  'problemType',
];

export function ScoreBreakdown({ score }: { score: Score }) {
  const { t, pick } = useI18n();
  const labelFor = (rule: string, component: ScoreComponentId) =>
    component === 'csTechniques' && rule !== 'crossList'
      ? pick(csLabel(rule))
      : pick(reasonLabel(rule));
  const penalties = score.reasons.filter((r) => r.component === 'penalty');
  return (
    <section className="panel" aria-labelledby="score-heading">
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 14 }}>
        <ScoreBadge score={score.total} large label={false} />
        <div>
          <h2 id="score-heading" style={{ marginBottom: 2 }}>
            {t('item.score')}
          </h2>
          <p className="small muted" style={{ margin: 0 }}>
            {t('common.scoreHint')}
          </p>
        </div>
      </div>
      {COMPONENTS.map((c) => {
        const comp = score.components[c];
        const reasons = score.reasons.filter((r) => r.component === c);
        const pct = comp.max ? Math.round((comp.score / comp.max) * 100) : 0;
        return (
          <div key={c} style={{ marginBottom: 14 }}>
            <div className="component-row">
              <strong className="small">{pick(SCORING.components[c].label)}</strong>
              <span className="small mono">
                {comp.score}/{comp.max}
              </span>
              <div className="bar" role="img" aria-label={`${comp.score} / ${comp.max}`}>
                <span style={{ width: `${pct}%` }} />
              </div>
            </div>
            {reasons.length > 0 && (
              <ul
                className="reasons"
                aria-label={`${t('item.scoreWhy')} — ${pick(SCORING.components[c].label)}`}
              >
                {reasons.map((r, i) => (
                  <li key={`${r.rule}-${i}`}>
                    <span>
                      {labelFor(r.rule, r.component)}
                      {r.match && (
                        <>
                          {' — '}
                          <span className="quote">
                            “{r.match.length > 70 ? r.match.slice(0, 70) + '…' : r.match}”
                          </span>
                        </>
                      )}{' '}
                      <span className="muted small">({t(`common.field.${r.field}`)})</span>
                    </span>
                    <span className="pts">+{r.points}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
      {penalties.length > 0 && (
        <ul className="reasons">
          {penalties.map((r, i) => (
            <li key={`p-${i}`}>
              <span>
                {pick(reasonLabel(r.rule))} — <span className="quote">“{r.match}”</span>
              </span>
              <span className="pts neg">{r.points}</span>
            </li>
          ))}
        </ul>
      )}
      {score.reasons.length === 0 && <p className="muted small">{t('item.scoreNoReasons')}</p>}
    </section>
  );
}
