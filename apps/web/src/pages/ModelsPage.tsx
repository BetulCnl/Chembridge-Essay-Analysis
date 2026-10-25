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

export default function ModelsPage() {
  const { t } = useI18n();
  const s = useAiSettings();
  const actives: ActiveProvider[] = ['none', 'webllm', 'ollama', 'byok'];
  return (
    <>
      <h1>{t('models.title')}</h1>
      <p className="muted" style={{ maxWidth: '72ch' }}>
        {t('models.intro')}
      </p>
      <fieldset className="panel section" style={{ border: '1px solid var(--border)' }}>
        <legend className="field-label" style={{ padding: '0 6px' }}>
          {t('models.active')}
        </legend>
        {actives.map((a) => (
          <label key={a} className="check">
            <input
              type="radio"
              name="active"
              checked={s.active === a}
              onChange={() => aiSettings.set({ active: a })}
            />
            {t(`models.active.${a}`)}
          </label>
        ))}
      </fieldset>
      <div className="grid-2">
        <WebLlmSection />
        <OllamaSection />
      </div>
      <ByokSection />
    </>
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
      aiSettings.set({ active: 'webllm' });
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section className="panel section" aria-labelledby="webllm-h">
      <h2 id="webllm-h">{t('models.layerB')}</h2>
      <h3>{t('models.webllm')}</h3>
      <p className="small muted">{t('models.webllmHint')}</p>
      {!gpu && <p className="notice notice-warn small">{t('models.webgpuMissing')}</p>}
      <label className="field">
        <span>{t('models.model')}</span>
        <select
          className="input"
          value={s.webllmModel}
          onChange={(e) => aiSettings.set({ webllmModel: e.target.value })}
        >
          {WEBLLM_MODELS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </label>
      {size !== undefined && <p className="small muted">VRAM ≈ {(size / 1024).toFixed(1)} GB</p>}
      <button
        type="button"
        className="btn btn-primary"
        disabled={!gpu || status === 'loading'}
        onClick={load}
      >
        {status === 'ready' ? `✓ ${t('models.loaded')}` : t('models.load')}
      </button>
      {status === 'loading' && progress && (
        <div style={{ marginTop: 10 }} aria-live="polite">
          <div
            className="progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round((progress.f ?? 0) * 100)}
          >
            <span style={{ width: `${Math.round((progress.f ?? 0) * 100)}%` }} />
          </div>
          <p className="small muted">{progress.text}</p>
        </div>
      )}
      {status === 'error' && (
        <p className="notice notice-warn small">{t('models.testFail', { e: error })}</p>
      )}
    </section>
  );
}

function OllamaSection() {
  const { t } = useI18n();
  const s = useAiSettings();
  const [result, setResult] = useState<{ ok: boolean; text: string } | undefined>();
  const [models, setModels] = useState<string[]>([]);
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
    <section className="panel section" aria-labelledby="ollama-h">
      <h2 id="ollama-h">{t('models.layerB')}</h2>
      <h3>{t('models.ollama')}</h3>
      <p className="small muted">
        {t('models.ollamaHint', { origin: typeof location !== 'undefined' ? location.origin : '' })}
      </p>
      <label className="field">
        <span>{t('models.ollamaUrl')}</span>
        <input
          className="input"
          value={s.ollamaUrl}
          onChange={(e) => aiSettings.set({ ollamaUrl: e.target.value })}
        />
      </label>
      <label className="field">
        <span>{t('models.ollamaModel')}</span>
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
      <button type="button" className="btn" onClick={test}>
        {t('models.test')}
      </button>
      {result && (
        <p
          className={`notice small ${result.ok ? '' : 'notice-warn'}`}
          role="status"
          style={{ marginTop: 10 }}
        >
          {result.text}
        </p>
      )}
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
    <section className="panel section" aria-labelledby="byok-h">
      <h2 id="byok-h">{t('models.layerC')}</h2>
      <p className="small muted" style={{ maxWidth: '72ch' }}>
        {t('models.layerCHint')}
      </p>
      <div className="grid-2">
        <label className="field">
          <span>{t('models.provider')}</span>
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
          <span>{t('models.model')}</span>
          <input
            className="input"
            value={s.byokModel}
            placeholder={s.byokProvider === 'gemini' ? 'gemini-2.0-flash' : 'provider/model-name'}
            onChange={(e) => aiSettings.set({ byokModel: e.target.value })}
          />
        </label>
        {s.byokProvider === 'openai' && (
          <label className="field">
            <span>{t('models.baseUrl')}</span>
            <input
              className="input"
              value={s.byokBaseUrl}
              onChange={(e) => aiSettings.set({ byokBaseUrl: e.target.value })}
            />
          </label>
        )}
        <label className="field">
          <span>{t('models.apiKey')}</span>
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
      <div className="card-actions">
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
          className="btn"
          disabled={!s.byokKey}
          onClick={() => {
            aiSettings.clearKey();
            setKey('');
            setSaved(false);
          }}
        >
          {t('models.clearKey')}
        </button>
        {saved && (
          <span className="small status-ok" role="status">
            {t('models.keySaved')}
          </span>
        )}
      </div>
    </section>
  );
}
