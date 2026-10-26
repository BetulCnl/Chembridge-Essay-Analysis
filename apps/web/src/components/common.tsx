import { ChevronDown, CircleAlert, Inbox } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../i18n/index.tsx';
import type { AsyncState } from '../lib/data.ts';
import { chemShort, csShort, csLabel, chemLabel } from '../lib/labels.ts';

/** Suitability score: a number with a thin meter. Scores under 40 are shown in a quieter tone. */
export function ScoreBadge({ score, large = false }: { score: number; large?: boolean }) {
  const { t } = useI18n();
  return (
    <span
      className={`score${large ? ' score-lg' : ''}`}
      data-level={score >= 40 ? 'high' : 'low'}
      title={t('common.scoreHint')}
      role="img"
      aria-label={`${t('common.score')}: ${score}/100`}
    >
      <span className="score-num" aria-hidden="true">
        {score}
        {large && <small>{t('common.of100')}</small>}
      </span>
      <span className="score-meter" aria-hidden="true">
        <i style={{ width: `${Math.max(2, Math.min(100, score))}%` }} />
      </span>
    </span>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className="loading">
      <span className="spinner" aria-hidden="true" /> {t('common.loading')}
    </p>
  );
}

export function ErrorState({ error, retry }: { error: Error; retry?: () => void }) {
  const { t } = useI18n();
  return (
    <div className="notice notice-warn" role="alert">
      <CircleAlert size={18} aria-hidden="true" />
      <div>
        <p>
          <strong>{t('common.error')}</strong>
        </p>
        <p className="small mono muted">{error.message}</p>
        {retry && (
          <button type="button" className="btn btn-sm" style={{ marginTop: 10 }} onClick={retry}>
            {t('common.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

export function EmptyState({
  title,
  children,
  icon,
}: {
  title: string;
  children?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon ?? <Inbox size={28} strokeWidth={1.5} aria-hidden="true" />}
      <strong>{title}</strong>
      {children}
    </div>
  );
}

export function NoData() {
  const { t } = useI18n();
  return (
    <EmptyState title={t('common.noData')}>
      <p className="small">{t('common.noDataHint')}</p>
    </EmptyState>
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
    <Link className="tag" to={`/?chem=${id}`} title={pick(chemLabel(id))}>
      {content}
    </Link>
  ) : (
    <span className="tag" title={pick(chemLabel(id))}>
      {content}
    </span>
  );
}

export function CsChip({ id, potential = false }: { id: string; potential?: boolean }) {
  const { pick, t } = useI18n();
  return (
    <span
      className={`tag ${potential ? 'tag-potential' : 'tag-cs'}`}
      title={potential ? `${pick(csLabel(id))} — ${t('common.potentialHint')}` : pick(csLabel(id))}
    >
      {pick(csShort(id))}
      {potential && <span className="sr-only"> ({t('common.potential')})</span>}
      {potential && <span aria-hidden="true">· {t('common.potential')}</span>}
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

/** Collapsible section built on <details>, so it works without JavaScript and with find-in-page. */
export function Disclosure({
  summary,
  children,
  defaultOpen = false,
}: {
  summary: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  return (
    <details className="disclosure" open={defaultOpen}>
      <summary>
        <span>{summary}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      {children}
    </details>
  );
}

/**
 * A button that opens a small panel (a bottom sheet on phones). Closes on Escape, on outside
 * click, and returns focus to the trigger.
 */
export function Popover({
  label,
  trigger,
  triggerClass = 'filter-trigger',
  active = false,
  align = 'start',
  children,
}: {
  label: string;
  trigger: ReactNode;
  triggerClass?: string;
  active?: boolean;
  align?: 'start' | 'end';
  children: (close: () => void) => ReactNode;
}) {
  // `refocus` returns focus to the trigger after closing from inside (Escape, "Done").
  const [state, setState] = useState({ open: false, refocus: false });
  const open = state.open;
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => setState({ open: false, refocus: true });

  useEffect(() => {
    if (!state.open) {
      if (state.refocus) button.current?.focus();
      return;
    }
    panel.current?.querySelector<HTMLElement>('input, button, select, a')?.focus();
    const onDown = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node))
        setState({ open: false, refocus: false });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setState({ open: false, refocus: true });
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [state]);

  return (
    <div className="popover-anchor" ref={root}>
      <button
        ref={button}
        type="button"
        className={triggerClass}
        data-active={active}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="dialog"
        onClick={() => setState({ open: !open, refocus: false })}
      >
        {trigger}
      </button>
      {open && (
        <>
          <div
            className="popover-backdrop"
            aria-hidden="true"
            onClick={() => setState({ open: false, refocus: false })}
          />
          <div
            ref={panel}
            id={id}
            role="dialog"
            aria-label={label}
            className={`popover${align === 'end' ? ' popover-end' : ''}`}
          >
            {children(close)}
          </div>
        </>
      )}
    </div>
  );
}
