import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FetchFn } from '../src/http/client.ts';

export const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

export function fixture(name: string): string {
  return readFileSync(join(FIXTURES, name), 'utf8');
}

export function tempDir(prefix = 'chembridge-test-'): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export interface FakeRoute {
  match: (url: string, init: RequestInit) => boolean;
  respond: (url: string, init: RequestInit) => Response | Promise<Response>;
}

/** A fetch replacement that serves fixtures and records every call. */
export function fakeFetch(
  routes: FakeRoute[],
): FetchFn & { calls: Array<{ url: string; headers: Record<string, string> }> } {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: { ...(init.headers as Record<string, string>) } });
    const route = routes.find((r) => r.match(url, init));
    if (!route) return new Response('not found', { status: 404 });
    return route.respond(url, init);
  }) as FetchFn & { calls: typeof calls };
  fn.calls = calls;
  return fn;
}

export const noSleep = async () => {};
