import { SCORING, type ScoreBreakdown as Score, type ScoreComponentId } from '@chembridge/core';
import { useI18n } from '../i18n/index.tsx';
import { csLabel, reasonLabel } from '../lib/labels.ts';
import { Disclosure, ScoreBadge } from './common.tsx';

const COMPONENTS: Array<Exclude<ScoreComponentId, 'penalty'>> = [
  'csTechniques',
  'dataIntensity',
  'openArtifacts',
  'problemType',
];

/** Total score, one bar per component and, on demand, every rule that contributed. */
export function ScoreBreakdown({ score }: { score: Score }) {
  const { t, pick } = useI18n();
  const labelFor = (rule: string, component: ScoreComponentId) =>
    component === 'csTechniques' && rule !== 'crossList'
      ? pick(csLabel(rule))
      : pick(reasonLabel(rule));
  const penalties = score.reasons.filter((r) => r.component === 'penalty');
  return (
    <section aria-labelledby="score-heading">
      <h2 id="score-heading">{t('item.score')}</h2>
      <div style={{ margin: '4px 0 18px' }}>
        <ScoreBadge score={score.total} large />
      </div>
      {COMPONENTS.map((c) => {
        const comp = score.components[c];
        const pct = comp.max ? Math.round((comp.score / comp.max) * 100) : 0;
        return (
          <div key={c} className="component">
            <div className="component-head">
              <span>{pick(SCORING.components[c].label)}</span>
              <span className="mono muted">
                {comp.score}/{comp.max}
              </span>
            </div>
            <div className="bar" role="img" aria-label={`${comp.score} / ${comp.max}`}>
              <span style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      {score.reasons.length === 0 ? (
        <p className="muted small">{t('item.scoreNoReasons')}</p>
      ) : (
        <Disclosure summary={t('item.scoreWhy')}>
          <ul className="reasons" aria-label={t('item.scoreWhy')}>
            {COMPONENTS.map((c) => {
              const reasons = score.reasons.filter((r) => r.component === c);
              if (!reasons.length) return null;
              return [
                <li key={`h-${c}`} className="group" aria-hidden="true">
                  {pick(SCORING.components[c].label)}
                </li>,
                ...reasons.map((r, i) => (
                  <li key={`${c}-${r.rule}-${i}`}>
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
                      <span className="muted">({t(`common.field.${r.field}`)})</span>
                    </span>
                    <span className="pts">+{r.points}</span>
                  </li>
                )),
              ];
            })}
            {penalties.map((r, i) => (
              <li key={`p-${i}`}>
                <span>
                  {pick(reasonLabel(r.rule))} — <span className="quote">“{r.match}”</span>
                </span>
                <span className="pts neg">{r.points}</span>
              </li>
            ))}
          </ul>
        </Disclosure>
      )}
    </section>
  );
}
