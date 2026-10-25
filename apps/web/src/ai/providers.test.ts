import { afterEach, describe, expect, it, vi } from 'vitest';
import { generate, ollamaModels, providerReady } from './providers.ts';
import { DEFAULT_AI, type AiSettings } from './settings.ts';

function stream(chunks: string[], init: ResponseInit = {}): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
  return new Response(body, { status: 200, ...init });
}

const messages = [{ role: 'user' as const, content: 'hi' }];

afterEach(() => vi.unstubAllGlobals());

describe('providers', () => {
  it('reports readiness per provider', () => {
    expect(providerReady(DEFAULT_AI)).toBe(false);
    expect(providerReady({ ...DEFAULT_AI, active: 'ollama' })).toBe(true);
    expect(providerReady({ ...DEFAULT_AI, active: 'byok', byokKey: 'k' })).toBe(false); // no model yet
    expect(providerReady({ ...DEFAULT_AI, active: 'byok', byokKey: 'k', byokModel: 'm' })).toBe(
      true,
    );
  });

  it('streams Ollama NDJSON across chunk boundaries', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      stream([
        '{"message":{"content":"Hel"}}\n{"mess',
        'age":{"content":"lo"}}\n',
        '{"done":true}\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const tokens: string[] = [];
    const s: AiSettings = { ...DEFAULT_AI, active: 'ollama', ollamaUrl: 'http://localhost:11434/' };
    const text = await generate(s, messages, {
      signal: new AbortController().signal,
      onToken: (t) => tokens.push(t),
    });
    expect(text).toBe('Hello');
    expect(tokens.at(-1)).toBe('Hello');
    expect(fetchMock.mock.calls[0]![0]).toBe('http://localhost:11434/api/chat');
  });

  it('streams OpenAI-compatible SSE and sends the key only to the configured endpoint', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      stream([
        'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
        ': keep-alive\n\ndata: {"choices":[{"delta":{"content":"B"}}]}\n\n',
        'data: [DONE]\n\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const s: AiSettings = {
      ...DEFAULT_AI,
      active: 'byok',
      byokKey: 'sk-test',
      byokModel: 'some/model',
      byokBaseUrl: 'https://openrouter.ai/api/v1',
    };
    const text = await generate(s, messages, { signal: new AbortController().signal });
    expect(text).toBe('AB');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    expect(JSON.parse(init.body as string)).toMatchObject({ model: 'some/model', stream: true });
  });

  it('streams Gemini SSE with the key in a header, not the URL', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      stream([
        'data: {"candidates":[{"content":{"parts":[{"text":"Mer"}]}}]}\r\n\r\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"haba"}]}}]}\r\n',
      ]),
    );
    vi.stubGlobal('fetch', fetchMock);
    const s: AiSettings = {
      ...DEFAULT_AI,
      active: 'byok',
      byokProvider: 'gemini',
      byokKey: 'g-key',
      byokModel: 'gemini-2.0-flash',
    };
    const text = await generate(s, [{ role: 'system', content: 'sys' }, ...messages], {
      signal: new AbortController().signal,
    });
    expect(text).toBe('Merhaba');
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).not.toContain('g-key');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g-key');
    expect(JSON.parse(init.body as string).systemInstruction.parts[0].text).toBe('sys');
  });

  it('surfaces HTTP errors with the provider message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"invalid key"}', { status: 401 })),
    );
    const s: AiSettings = { ...DEFAULT_AI, active: 'byok', byokKey: 'bad', byokModel: 'm' };
    await expect(generate(s, messages, { signal: new AbortController().signal })).rejects.toThrow(
      /HTTP 401.*invalid key/,
    );
  });

  it('lists local Ollama models', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json({ models: [{ name: 'qwen2.5:3b' }, { name: 'llama3.2:3b' }] }),
      ),
    );
    expect(await ollamaModels('http://localhost:11434')).toEqual(['qwen2.5:3b', 'llama3.2:3b']);
  });
});
