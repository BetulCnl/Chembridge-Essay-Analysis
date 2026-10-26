import {
  buildIdeaPrompt,
  parseGeneratedIdeas,
  type DetailEntry,
  type Idea,
} from '@chembridge/core';
import { Sparkles } from 'lucide-react';
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
    <section className="generator" aria-labelledby="gen-heading">
      <h3 id="gen-heading">
        <Sparkles size={16} aria-hidden="true" /> {t('gen.title')}
      </h3>
      {!ready ? (
        <p>
          {t('gen.noModel')} <Link to="/models">{t('gen.openSettings')}</Link>
        </p>
      ) : (
        <>
          <p>{t('gen.intro')}</p>
          <div className="btn-row">
            {phase.kind === 'running' ? (
              <button type="button" className="btn" onClick={() => abort.current?.abort()}>
                {t('gen.stop')}
              </button>
            ) : (
              <button type="button" className="btn btn-primary" onClick={run}>
                {t('gen.run')}
              </button>
            )}
            <span className="small muted">{t(`models.active.${settings.active}`)}</span>
          </div>
        </>
      )}
      <div aria-live="polite">
        {phase.kind === 'running' && (
          <>
            <p className="loading" style={{ padding: '14px 0 0' }}>
              <span className="spinner" aria-hidden="true" />
              {phase.progress ? t('gen.loadingModel', { p: phase.progress }) : t('gen.running')}
            </p>
            {phase.text && <pre className="stream">{phase.text}</pre>}
          </>
        )}
        {phase.kind === 'error' && (
          <p className="notice notice-warn" role="alert" style={{ marginTop: 14 }}>
            {t('gen.error', { e: phase.message })}
          </p>
        )}
        {phase.kind === 'done' && (
          <div style={{ marginTop: 16 }}>
            <p className="small muted" style={{ marginBottom: 12 }}>
              {t('gen.disclaimer')}
            </p>
            {phase.ideas ? (
              <div className="ideas">
                {phase.ideas.map((idea) => (
                  <IdeaCard key={idea.id} idea={idea} itemTitle={item.title} headingLevel={4} />
                ))}
              </div>
            ) : (
              <>
                <p className="small">{t('gen.parseFallback')}</p>
                <pre className="stream">{phase.raw}</pre>
              </>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
