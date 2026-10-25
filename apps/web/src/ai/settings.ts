/**
 * Layer B/C settings. Everything — including an optional API key — lives only in this browser's
 * localStorage and is sent nowhere except directly to the provider the user picked.
 */
import { useSyncExternalStore } from 'react';
import { readJsonStorage, writeStorage } from '../lib/storage.ts';

export type ActiveProvider = 'none' | 'webllm' | 'ollama' | 'byok';
export type ByokProvider = 'openai' | 'gemini';

export interface AiSettings {
  active: ActiveProvider;
  webllmModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  byokProvider: ByokProvider;
  byokBaseUrl: string;
  byokModel: string;
  byokKey: string;
}

/** Small instruct models from WebLLM's prebuilt list (verified against @mlc-ai/web-llm 0.2.86). */
export const WEBLLM_MODELS = [
  'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
  'Qwen2.5-3B-Instruct-q4f16_1-MLC',
  'Llama-3.2-1B-Instruct-q4f16_1-MLC',
  'Llama-3.2-3B-Instruct-q4f16_1-MLC',
  'gemma-2-2b-it-q4f16_1-MLC',
  'Phi-3.5-mini-instruct-q4f16_1-MLC',
] as const;

export const DEFAULT_AI: AiSettings = {
  active: 'none',
  webllmModel: WEBLLM_MODELS[0],
  ollamaUrl: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:3b',
  byokProvider: 'openai',
  byokBaseUrl: 'https://openrouter.ai/api/v1',
  byokModel: '',
  byokKey: '',
};

const KEY = 'chembridge.ai.v1';
const listeners = new Set<() => void>();
let current: AiSettings = { ...DEFAULT_AI, ...readJsonStorage<Partial<AiSettings>>(KEY, {}) };

export const aiSettings = {
  get: (): AiSettings => current,
  set(patch: Partial<AiSettings>): void {
    current = { ...current, ...patch };
    writeStorage(KEY, JSON.stringify(current));
    for (const l of listeners) l();
  },
  clearKey(): void {
    aiSettings.set({ byokKey: '', active: current.active === 'byok' ? 'none' : current.active });
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useAiSettings(): AiSettings {
  return useSyncExternalStore(aiSettings.subscribe, aiSettings.get, aiSettings.get);
}

export function hasWebGPU(): boolean {
  return typeof navigator !== 'undefined' && 'gpu' in navigator;
}
