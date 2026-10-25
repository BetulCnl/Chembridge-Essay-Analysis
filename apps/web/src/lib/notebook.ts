/**
 * Idea notebook: saved ideas + personal notes, persisted in localStorage only, with JSON
 * export/import. Synchronised across tabs through the `storage` event.
 */
import { useSyncExternalStore } from 'react';
import type { Idea } from '@chembridge/core';
import { readJsonStorage, writeStorage } from './storage.ts';

export type NoteStatus = 'idea' | 'exploring' | 'archived';

export interface NotebookEntry {
  id: string;
  itemId: string;
  itemTitle: string;
  idea: Idea;
  savedAt: string;
  note: string;
  status: NoteStatus;
}

interface ExportFile {
  format: 'chembridge-notebook';
  version: 1;
  exportedAt: string;
  entries: NotebookEntry[];
}

const KEY = 'chembridge.notebook.v1';
const listeners = new Set<() => void>();
let entries: NotebookEntry[] = load();

function load(): NotebookEntry[] {
  const v = readJsonStorage<unknown>(KEY, []);
  return Array.isArray(v) ? v.filter(isEntry) : [];
}

function isEntry(x: unknown): x is NotebookEntry {
  const e = x as NotebookEntry;
  return Boolean(
    e &&
    typeof e.id === 'string' &&
    typeof e.itemId === 'string' &&
    e.idea &&
    typeof e.idea.title === 'object',
  );
}

function commit(next: NotebookEntry[]): void {
  entries = next;
  writeStorage(KEY, JSON.stringify(entries));
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    entries = load();
    for (const l of listeners) l();
  });
}

export const notebook = {
  list: (): NotebookEntry[] => entries,
  has: (id: string): boolean => entries.some((e) => e.id === id),
  save(idea: Idea, itemTitle: string): void {
    if (entries.some((e) => e.id === idea.id)) return;
    commit([
      {
        id: idea.id,
        itemId: idea.itemId,
        itemTitle,
        idea,
        savedAt: new Date().toISOString(),
        note: '',
        status: 'idea',
      },
      ...entries,
    ]);
  },
  update(id: string, patch: Partial<Pick<NotebookEntry, 'note' | 'status'>>): void {
    commit(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  },
  remove(id: string): void {
    commit(entries.filter((e) => e.id !== id));
  },
  exportJson(): string {
    const file: ExportFile = {
      format: 'chembridge-notebook',
      version: 1,
      exportedAt: new Date().toISOString(),
      entries,
    };
    return JSON.stringify(file, null, 2);
  },
  /** Merges entries from an export file; returns how many were added. Throws on invalid input. */
  importJson(text: string): number {
    const parsed = JSON.parse(text) as Partial<ExportFile> | NotebookEntry[];
    const incoming = Array.isArray(parsed)
      ? parsed
      : parsed.format === 'chembridge-notebook'
        ? (parsed.entries ?? [])
        : null;
    if (!incoming) throw new Error('not a ChemBridge notebook export');
    const valid = incoming.filter(isEntry);
    const known = new Set(entries.map((e) => e.id));
    const added = valid.filter((e) => !known.has(e.id));
    commit([...added, ...entries]);
    return added.length;
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

export function useNotebook(): NotebookEntry[] {
  return useSyncExternalStore(notebook.subscribe, notebook.list, notebook.list);
}

/** Triggers a browser download of `content`. */
export function downloadText(filename: string, content: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
