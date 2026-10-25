/**
 * Model back-ends for Layer B (WebLLM in the browser, Ollama on the user's machine) and Layer C
 * (OpenAI-compatible endpoints such as OpenRouter/Groq, or Google Gemini) — all called directly
 * from the browser. All of them stream tokens.
 */
import type { ChatMessage } from '@chembridge/core';
import type { AiSettings } from './settings.ts';

export interface GenerateOptions {
  signal: AbortSignal;
  onToken?: (textSoFar: string) => void;
  onProgress?: (label: string, fraction?: number) => void;
}

type WebLlmEngine = {
  chat: {
    completions: {
      create: (
        req: Record<string, unknown>,
      ) => Promise<AsyncIterable<{ choices: Array<{ delta?: { content?: string } }> }>>;
    };
  };
  interruptGenerate?: () => void;
};

let engine: { model: string; promise: Promise<WebLlmEngine> } | undefined;

/** Loads (and caches) a WebLLM engine; the model weights are cached by the browser after the first download. */
export function loadWebLlm(
  model: string,
  onProgress?: GenerateOptions['onProgress'],
): Promise<WebLlmEngine> {
  if (engine?.model === model) return engine.promise;
  const promise = import('@mlc-ai/web-llm').then(async (webllm) => {
    const e = await webllm.CreateMLCEngine(model, {
      initProgressCallback: (r: { text: string; progress: number }) =>
        onProgress?.(r.text, r.progress),
    });
    return e as unknown as WebLlmEngine;
  });
  engine = { model, promise };
  promise.catch(() => (engine = undefined));
  return promise;
}

export function webLlmModelSize(model: string): Promise<number | undefined> {
  return import('@mlc-ai/web-llm').then((w) => {
    const rec = w.prebuiltAppConfig.model_list.find(
      (m: { model_id: string }) => m.model_id === model,
    ) as { vram_required_MB?: number } | undefined;
    return rec?.vram_required_MB;
  });
}

async function* readLines(res: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  const onAbort = () => void reader.cancel();
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl = buf.indexOf('\n');
      while (nl !== -1) {
        yield buf.slice(0, nl).replace(/\r$/, '');
        buf = buf.slice(nl + 1);
        nl = buf.indexOf('\n');
      }
    }
    if (buf) yield buf;
  } finally {
    signal.removeEventListener('abort', onAbort);
  }
}

async function ensureOk(res: Response): Promise<void> {
  if (res.ok) return;
  let detail = '';
  try {
    detail = (await res.text()).slice(0, 300);
  } catch {
    /* ignore */
  }
  throw new Error(`HTTP ${res.status}${detail ? `: ${detail}` : ''}`);
}

async function viaWebLlm(
  s: AiSettings,
  messages: ChatMessage[],
  o: GenerateOptions,
): Promise<string> {
  const e = await loadWebLlm(s.webllmModel, o.onProgress);
  const stream = await e.chat.completions.create({
    messages,
    stream: true,
    temperature: 0.7,
    max_tokens: 1400,
  });
  let text = '';
  for await (const chunk of stream) {
    if (o.signal.aborted) {
      e.interruptGenerate?.();
      break;
    }
    text += chunk.choices[0]?.delta?.content ?? '';
    o.onToken?.(text);
  }
  return text;
}

async function viaOllama(
  s: AiSettings,
  messages: ChatMessage[],
  o: GenerateOptions,
): Promise<string> {
  const res = await fetch(`${s.ollamaUrl.replace(/\/+$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: s.ollamaModel,
      messages,
      stream: true,
      options: { temperature: 0.7 },
    }),
    signal: o.signal,
  });
  await ensureOk(res);
  let text = '';
  for await (const line of readLines(res, o.signal)) {
    if (!line.trim()) continue;
    const msg = JSON.parse(line) as { message?: { content?: string }; error?: string };
    if (msg.error) throw new Error(msg.error);
    text += msg.message?.content ?? '';
    o.onToken?.(text);
  }
  return text;
}

async function viaOpenAiCompatible(
  s: AiSettings,
  messages: ChatMessage[],
  o: GenerateOptions,
): Promise<string> {
  const res = await fetch(`${s.byokBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${s.byokKey}`,
      // OpenRouter uses these optional headers for attribution; other providers ignore them.
      'HTTP-Referer': location.origin,
      'X-Title': 'ChemBridge',
    },
    body: JSON.stringify({
      model: s.byokModel,
      messages,
      stream: true,
      temperature: 0.7,
      max_tokens: 1400,
    }),
    signal: o.signal,
  });
  await ensureOk(res);
  let text = '';
  for await (const line of readLines(res, o.signal)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (data === '[DONE]') break;
    const chunk = JSON.parse(data) as {
      choices?: Array<{ delta?: { content?: string } }>;
      error?: { message?: string };
    };
    if (chunk.error) throw new Error(chunk.error.message ?? 'provider error');
    text += chunk.choices?.[0]?.delta?.content ?? '';
    o.onToken?.(text);
  }
  return text;
}

async function viaGemini(
  s: AiSettings,
  messages: ChatMessage[],
  o: GenerateOptions,
): Promise<string> {
  const system = messages
    .filter((m) => m.role === 'system')
    .map((m) => m.content)
    .join('\n');
  const contents = messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  const model = s.byokModel || 'gemini-2.0-flash';
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.byokKey },
      body: JSON.stringify({
        contents,
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        generationConfig: { temperature: 0.7, maxOutputTokens: 1600 },
      }),
      signal: o.signal,
    },
  );
  await ensureOk(res);
  let text = '';
  for await (const line of readLines(res, o.signal)) {
    if (!line.startsWith('data:')) continue;
    const chunk = JSON.parse(line.slice(5)) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    text += chunk.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    o.onToken?.(text);
  }
  return text;
}

export function providerReady(s: AiSettings): boolean {
  if (s.active === 'webllm') return Boolean(s.webllmModel);
  if (s.active === 'ollama') return Boolean(s.ollamaUrl && s.ollamaModel);
  if (s.active === 'byok')
    return Boolean(s.byokKey && (s.byokProvider === 'gemini' || (s.byokBaseUrl && s.byokModel)));
  return false;
}

export function generate(
  s: AiSettings,
  messages: ChatMessage[],
  o: GenerateOptions,
): Promise<string> {
  switch (s.active) {
    case 'webllm':
      return viaWebLlm(s, messages, o);
    case 'ollama':
      return viaOllama(s, messages, o);
    case 'byok':
      return s.byokProvider === 'gemini'
        ? viaGemini(s, messages, o)
        : viaOpenAiCompatible(s, messages, o);
    default:
      return Promise.reject(new Error('no model selected'));
  }
}

/** Lists the models of a local Ollama server (also a connectivity check). */
export async function ollamaModels(url: string, signal?: AbortSignal): Promise<string[]> {
  const res = await fetch(`${url.replace(/\/+$/, '')}/api/tags`, signal ? { signal } : {});
  await ensureOk(res);
  const json = (await res.json()) as { models?: Array<{ name: string }> };
  return (json.models ?? []).map((m) => m.name);
}
