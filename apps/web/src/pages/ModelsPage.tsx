import { CircleAlert, CircleCheck, Info } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { loadWebLlm, ollamaModels, webLlmModelSize } from '../ai/providers.ts';
import {
  aiSettings,
  hasWebGPU,
  useAiSettings,
  WEBLLM_MODELS,
  type ActiveProvider,
  type ByokProvider,
} from '../ai/settings.ts';

const OPTIONS: ActiveProvider[] = ['none', 'webllm', 'ollama', 'byok'];

/** "Qwen2.5-3B-Instruct-q4f16_1-MLC" → "Qwen2.5 3B" */
function modelName(id: string): string {
  const [family = id, size = ''] = id
    .replace(/-(Instruct|it|instruct).*$/, '')
    .split(/-(?=[\d.]+B$|mini$)/);
  return `${family.replace(/^gemma/, 'Gemma').replace(/-/g, ' ')} ${size.replace(/b$/, 'B')}`.trim();
}

export default function ModelsPage() {
  const { t } = useI18n();
  const s = useAiSettings();
  return (
    <>
      <header className="page-head">
        <h1>{t('models.title')}</h1>
      </header>
      <p className="notice prose" style={{ marginBottom: 32 }}>
        <Info size={18} aria-hidden="true" />
        <span>{t('models.intro')}</span>
      </p>

      <fieldset style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
        <legend className="section-head" style={{ padding: 0 }}>
          <h2>{t('models.choose')}</h2>
        </legend>
        <div className="choice-grid">
          {OPTIONS.map((o) => (
            <label key={o} className="choice">
              <input
                type="radio"
                name="ai-provider"
                checked={s.active === o}
                onChange={() => aiSettings.set({ active: o })}
              />
              <strong>{t(`models.opt.${o}`)}</strong>
              <span className="desc">{t(`models.opt.${o}.desc`)}</span>
              {o !== 'byok' && <span className="pill pill-ok">{t('models.pill.free')}</span>}
            </label>
          ))}
        </div>
      </fieldset>

      {s.active === 'webllm' && <WebLlmSection />}
      {s.active === 'ollama' && <OllamaSection />}
      {s.active === 'byok' && <ByokSection />}
    </>
  );
}

function Status({ ok, children }: { ok: boolean; children: string }) {
  return (
    <p
      className={`notice ${ok ? 'notice-ok' : 'notice-warn'}`}
      role="status"
      style={{ marginTop: 16 }}
    >
      {ok ? (
        <CircleCheck size={18} aria-hidden="true" />
      ) : (
        <CircleAlert size={18} aria-hidden="true" />
      )}
      <span style={{ overflowWrap: 'anywhere' }}>{children}</span>
    </p>
  );
}

function WebLlmSection() {
  const { t } = useI18n();
  const s = useAiSettings();
  const [size, setSize] = useState<number | undefined>();
  const [progress, setProgress] = useState<{ text: string; f?: number } | undefined>();
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [error, setError] = useState('');
  const gpu = hasWebGPU();

  useEffect(() => {
    let alive = true;
    webLlmModelSize(s.webllmModel).then(
      (v) => alive && setSize(v),
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [s.webllmModel]);

  const load = async () => {
    setStatus('loading');
    try {
      await loadWebLlm(s.webllmModel, (text, f) =>
        setProgress({ text, ...(f !== undefined ? { f } : {}) }),
      );
      setStatus('ready');
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="card config-card" aria-labelledby="webllm-h">
      <h2 id="webllm-h">{t('models.webllm')}</h2>
      <p>{t('models.webllmHint')}</p>
      {!gpu && (
        <p className="notice notice-warn" style={{ marginBottom: 16 }}>
          <CircleAlert size={18} aria-hidden="true" />
          <span>{t('models.webgpuMissing')}</span>
        </p>
      )}
      <label className="field" style={{ maxWidth: 420 }}>
        <span className="field-label">{t('models.model')}</span>
        <select
          className="input"
          value={s.webllmModel}
          onChange={(e) => {
            aiSettings.set({ webllmModel: e.target.value });
            setStatus('idle');
          }}
        >
          {WEBLLM_MODELS.map((m) => (
            <option key={m} value={m}>
              {modelName(m)}
            </option>
          ))}
        </select>
        <span className="field-hint">
          {size !== undefined && `${t('models.size', { n: (size / 1024).toFixed(1) })} · `}
          {t('models.webllm.note')}
        </span>
      </label>
      <div className="btn-row" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!gpu || status === 'loading' || status === 'ready'}
          onClick={load}
        >
          {status === 'ready' ? t('models.loaded') : t('models.load')}
        </button>
      </div>
      {status === 'loading' && progress && (
        <div aria-live="polite">
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress.f ?? 0) * 100)}
          >
            <span style={{ width: `${Math.round((progress.f ?? 0) * 100)}%` }} />
          </div>
          <p className="small muted" style={{ marginTop: 8 }}>
            {progress.text}
          </p>
        </div>
      )}
      {status === 'error' && <Status ok={false}>{t('models.testFail', { e: error })}</Status>}
    </section>
  );
}

function OllamaSection() {
  const { t } = useI18n();
  const s = useAiSettings();
  const [result, setResult] = useState<{ ok: boolean; text: string } | undefined>();
  const [models, setModels] = useState<string[]>([]);
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const test = async () => {
    try {
      const list = await ollamaModels(s.ollamaUrl, AbortSignal.timeout(8000));
      setModels(list);
      setResult({ ok: true, text: `${t('models.testOk')} ${list.length ? list.join(', ') : ''}` });
    } catch (e) {
      setResult({
        ok: false,
        text: t('models.testFail', { e: e instanceof Error ? e.message : String(e) }),
      });
    }
  };
  return (
    <section className="card config-card" aria-labelledby="ollama-h">
      <h2 id="ollama-h">{t('models.ollama')}</h2>
      <p>
        {t('models.ollamaHint')}
        <code className="code-line">OLLAMA_ORIGINS="{origin}" ollama serve</code>
      </p>
      <div className="form-grid cols-2">
        <label className="field">
          <span className="field-label">{t('models.ollamaUrl')}</span>
          <input
            className="input"
            value={s.ollamaUrl}
            onChange={(e) => aiSettings.set({ ollamaUrl: e.target.value })}
          />
        </label>
        <label className="field">
          <span className="field-label">{t('models.ollamaModel')}</span>
          <input
            className="input"
            list="ollama-models"
            value={s.ollamaModel}
            onChange={(e) => aiSettings.set({ ollamaModel: e.target.value })}
          />
          <datalist id="ollama-models">
            {models.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="btn-row" style={{ marginTop: 18 }}>
        <button type="button" className="btn" onClick={test}>
          {t('models.test')}
        </button>
      </div>
      {result && <Status ok={result.ok}>{result.text}</Status>}
    </section>
  );
}

function ByokSection() {
  const { t } = useI18n();
  const s = useAiSettings();
  const [key, setKey] = useState(s.byokKey);
  const [saved, setSaved] = useState(false);
  const providers: ByokProvider[] = ['openai', 'gemini'];
  return (
    <section className="card config-card" aria-labelledby="byok-h">
      <h2 id="byok-h">{t('models.opt.byok')}</h2>
      <p>{t('models.layerCHint')}</p>
      <div className="form-grid cols-2">
        <label className="field">
          <span className="field-label">{t('models.provider')}</span>
          <select
            className="input"
            value={s.byokProvider}
            onChange={(e) => {
              const p = e.target.value as ByokProvider;
              aiSettings.set({
                byokProvider: p,
                byokModel: p === 'gemini' ? 'gemini-2.0-flash' : s.byokModel,
              });
            }}
          >
            {providers.map((p) => (
              <option key={p} value={p}>
                {t(`models.provider.${p}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">{t('models.model')}</span>
          <input
            className="input"
            value={s.byokModel}
            placeholder={s.byokProvider === 'gemini' ? 'gemini-2.0-flash' : 'provider/model-name'}
            onChange={(e) => aiSettings.set({ byokModel: e.target.value })}
          />
        </label>
        {s.byokProvider === 'openai' && (
          <label className="field">
            <span className="field-label">{t('models.baseUrl')}</span>
            <input
              className="input"
              value={s.byokBaseUrl}
              onChange={(e) => aiSettings.set({ byokBaseUrl: e.target.value })}
            />
          </label>
        )}
        <label className="field">
          <span className="field-label">{t('models.apiKey')}</span>
          <input
            className="input"
            type="password"
            autoComplete="off"
            spellCheck={false}
            value={key}
            onChange={(e) => {
              setKey(e.target.value);
              setSaved(false);
            }}
          />
        </label>
      </div>
      <div className="btn-row" style={{ marginTop: 18 }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!key}
          onClick={() => {
            aiSettings.set({ byokKey: key.trim(), active: 'byok' });
            setSaved(true);
          }}
        >
          {t('models.saveKey')}
        </button>
        <button
          type="button"
          className="btn btn-quiet"
          disabled={!s.byokKey}
          onClick={() => {
            aiSettings.clearKey();
            setKey('');
            setSaved(false);
          }}
        >
          {t('models.clearKey')}
        </button>
      </div>
      {saved && <Status ok>{t('models.keySaved')}</Status>}
    </section>
  );
}
