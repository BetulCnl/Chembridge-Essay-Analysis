import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';
import type { AsyncState } from '../lib/data.ts';
import { chemShort, csShort, csLabel, chemLabel } from '../lib/labels.ts';

function scoreClass(score: number): string {
  if (score >= 60) return 'score-hi';
  if (score >= 40) return 'score-mid';
  if (score >= 20) return 'score-lo';
  return 'score-min';
}

export function ScoreBadge({
  score,
  large = false,
  label = true,
}: {
  score: number;
  large?: boolean;
  label?: boolean;
}) {
  const { t } = useI18n();
  return (
    <span
      className={`score ${scoreClass(score)}${large ? ' score-lg' : ''}`}
      title={t('common.scoreHint')}
      aria-label={`${t('common.score')}: ${score}/100`}
    >
      <span aria-hidden="true">{score}</span>
      {label && <small aria-hidden="true">{t('common.score')}</small>}
    </span>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className="muted">
      <span className="spinner" aria-hidden="true" /> {t('common.loading')}
    </p>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="notice notice-warn" role="alert">
      <p>{t('common.error')}</p>
      <p className="small mono">{error.message}</p>
      {retry && (
        <button type="button" className="btn btn-sm" onClick={retry}>
          {t('common.retry')}
        </button>
      )}
    </div>
  );
}

export function NoData() {
  const { t } = useI18n();
  return (
    <div className="notice">
      <p>
        <strong>{t('common.noData')}</strong>
      </p>
      <p className="small muted">{t('common.noDataHint')}</p>
    </div>
  );
}

/** Renders loading / empty / error states and calls `children` once data is ready. */
export function Async<T>({
  state,
  children,
}: {
  state: AsyncState<T> & { retry: () => void };
  children: (data: T) => ReactNode;
}) {
  if (state.status === 'loading') return <Loading />;
  if (state.status === 'empty') return <NoData />;
  if (state.status === 'error') return <ErrorState error={state.error} retry={state.retry} />;
  return <>{children(state.data)}</>;
}

export function ChemChip({ id, linked = false }: { id: string; linked?: boolean }) {
  const { pick } = useI18n();
  const content = pick(chemShort(id));
  return linked ? (
    <Link className="chip chip-chem" to={`/?chem=${id}`} title={pick(chemLabel(id))}>
      {content}
    </Link>
  ) : (
    <span className="chip chip-chem" title={pick(chemLabel(id))}>
      {content}
    </span>
  );
}

export function CsChip({ id, potential = false }: { id: string; potential?: boolean }) {
  const { pick, t } = useI18n();
  return (
    <span
      className={`chip ${potential ? 'chip-potential' : 'chip-cs'}`}
      title={potential ? `${pick(csLabel(id))} — ${t('common.potentialHint')}` : pick(csLabel(id))}
    >
      {pick(csShort(id))}
      {potential && <span className="sr-only"> ({t('common.potential')})</span>}
      {potential && <span aria-hidden="true"> · {t('common.potential')}</span>}
    </span>
  );
}

export function Dots({ n, max = 5, label }: { n: number; max?: number; label: string }) {
  return (
    <span className="dots" role="img" aria-label={label}>
      {Array.from({ length: max }, (_, i) => (
        <i key={i} className={i < n ? 'on' : ''} />
      ))}
    </span>
  );
}

export function TypeLabel({ type }: { type: 'preprint' | 'article' | 'news' }) {
  const { t } = useI18n();
  return <>{t(`common.${type}`)}</>;
}
