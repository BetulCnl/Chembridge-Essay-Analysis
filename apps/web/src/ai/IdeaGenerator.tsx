import {
  buildIdeaPrompt,
  parseGeneratedIdeas,
  type DetailEntry,
  type Idea,
} from '@chembridge/core';
import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { IdeaCard } from '../components/IdeaCard.tsx';
import { useI18n } from '../i18n/index.tsx';
import { generate, providerReady } from './providers.ts';
import { useAiSettings } from './settings.ts';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; text: string; progress?: string }
  | { kind: 'done'; ideas?: Idea[]; raw: string }
  | { kind: 'error'; message: string };

/** Layer B/C: asks the user-selected model for more creative ideas, seeded with Layer A. */
export function IdeaGenerator({ item, seedIdeas }: { item: DetailEntry; seedIdeas: Idea[] }) {
  const { t, lang } = useI18n();
  const settings = useAiSettings();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const abort = useRef<AbortController | null>(null);
  const ready = providerReady(settings);
  const layer = settings.active === 'byok' ? 'C' : 'B';

  const run = async () => {
    const ctrl = new AbortController();
    abort.current = ctrl;
    setPhase({ kind: 'running', text: '' });
    try {
      const raw = await generate(settings, buildIdeaPrompt(item, seedIdeas, lang), {
        signal: ctrl.signal,
        onToken: (text) => setPhase({ kind: 'running', text }),
        onProgress: (label, fraction) =>
          setPhase({
            kind: 'running',
            text: '',
            progress: fraction !== undefined ? `${Math.round(fraction * 100)}% · ${label}` : label,
          }),
      });
      const ideas = parseGeneratedIdeas(raw, item, layer);
      setPhase({ kind: 'done', raw, ...(ideas ? { ideas } : {}) });
    } catch (err) {
      if (ctrl.signal.aborted) setPhase({ kind: 'idle' });
      else setPhase({ kind: 'error', message: err instanceof Error ? err.message : String(err) });
    } finally {
      abort.current = null;
    }
  };

  return (
    <section className="panel section" aria-labelledby="gen-heading">
      <h3 id="gen-heading">{t('gen.title')}</h3>
      <p className="small muted">{t('gen.intro')}</p>
      {!ready ? (
        <p className="small">
          {t('gen.noModel')} <Link to="/models">{t('gen.openSettings')}</Link>
        </p>
      ) : (
        <div className="card-actions">
          {phase.kind === 'running' ? (
            <button type="button" className="btn" onClick={() => abort.current?.abort()}>
              {t('gen.stop')}
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={run}>
              {t('gen.run')} · {t(`models.active.${settings.active}`)}
            </button>
          )}
        </div>
      )}
      <div aria-live="polite">
        {phase.kind === 'running' && (
          <div style={{ marginTop: 12 }}>
            <p className="small muted">
              <span className="spinner" aria-hidden="true" />{' '}
              {phase.progress ? t('gen.loadingModel', { p: phase.progress }) : t('gen.running')}
            </p>
            {phase.text && (
              <pre
                className="small mono"
                style={{
                  whiteSpace: 'pre-wrap',
                  maxHeight: 220,
                  overflow: 'auto',
                  background: 'var(--surface-2)',
                  padding: 10,
                  borderRadius: 6,
                }}
              >
                {phase.text}
              </pre>
            )}
          </div>
        )}
        {phase.kind === 'error' && (
          <p className="notice notice-warn small" role="alert">
            {t('gen.error', { e: phase.message })}
          </p>
        )}
        {phase.kind === 'done' && (
          <div style={{ marginTop: 12 }}>
            <p className="small muted">{t('gen.disclaimer')}</p>
            {phase.ideas ? (
              phase.ideas.map((idea) => (
                <IdeaCard key={idea.id} idea={idea} itemTitle={item.title} headingLevel={4} />
              ))
            ) : (
              <>
                <p className="small">{t('gen.parseFallback')}</p>
                <pre className="small mono" style={{ whiteSpace: 'pre-wrap' }}>
                  {phase.raw}
                </pre>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
