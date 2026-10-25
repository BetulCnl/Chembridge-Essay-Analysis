import { describe, expect, it } from 'vitest';
import { ConditionalCache } from '../src/http/conditionalCache.ts';
import {
  BotChallengeError,
  HttpClient,
  HttpError,
  parseRetryAfter,
  RobotsDisallowedError,
} from '../src/http/client.ts';
import { RateLimiter } from '../src/http/rateLimiter.ts';
import { isAllowed, parseRobots } from '../src/http/robots.ts';
import { fakeFetch, noSleep } from './helpers.ts';

const policy = { minIntervalMs: 0, timeoutMs: 1000, retries: 3 };

describe('RateLimiter', () => {
  it('spaces request starts per host and lets other hosts through', async () => {
    let clock = 0;
    const waits: number[] = [];
    const limiter = new RateLimiter(
      () => clock,
      async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    );
    const starts: Array<[string, number]> = [];
    const task = (k: string) => async () => {
      starts.push([k, clock]);
    };
    await Promise.all([
      limiter.schedule('a', 3000, task('a')),
      limiter.schedule('a', 3000, task('a')),
      limiter.schedule('b', 3000, task('b')),
    ]);
    const aStarts = starts.filter(([k]) => k === 'a').map(([, t]) => t);
    expect(aStarts[1]! - aStarts[0]!).toBeGreaterThanOrEqual(3000);
    expect(waits).toContain(3000);
  });
});

describe('HttpClient', () => {
  it('retries 429 honouring Retry-After, then succeeds', async () => {
    let n = 0;
    const fetchFn = fakeFetch([
      {
        match: () => true,
        respond: () =>
          ++n < 3
            ? new Response('slow down', { status: 429, headers: { 'Retry-After': '1' } })
            : new Response('ok'),
      },
    ]);
    const http = new HttpClient({ userAgent: 'test', fetchFn, sleep: noSleep });
    const res = await http.get('https://api.example.org/x', { source: 's', policy });
    expect(res.text).toBe('ok');
    expect(http.requestCount('s')).toBe(3);
    expect(fetchFn.calls[0]!.headers['User-Agent']).toBe('test');
  });

  it('gives up when Retry-After exceeds the policy cap (daily budgets)', async () => {
    const fetchFn = fakeFetch([
      {
        match: () => true,
        respond: () => new Response('{}', { status: 429, headers: { 'Retry-After': '8028' } }),
      },
    ]);
    const http = new HttpClient({ userAgent: 't', fetchFn, sleep: noSleep });
    await expect(
      http.get('https://api.example.org/x', {
        source: 's',
        policy: { ...policy, maxRetryAfterMs: 30_000 },
      }),
    ).rejects.toBeInstanceOf(HttpError);
    expect(http.requestCount('s')).toBe(1);
  });

  it('never retries a bot-protection challenge', async () => {
    const fetchFn = fakeFetch([
      {
        match: () => true,
        respond: () =>
          new Response('<html><head><title>Just a moment...</title>', {
            status: 403,
            headers: { 'cf-mitigated': 'challenge' },
          }),
      },
    ]);
    const http = new HttpClient({ userAgent: 't', fetchFn, sleep: noSleep });
    await expect(
      http.get('https://chemrxiv.example/api', { source: 's', policy }),
    ).rejects.toBeInstanceOf(BotChallengeError);
    expect(http.requestCount('s')).toBe(1);
  });

  it('does not retry ordinary 4xx and accepts declared statuses', async () => {
    const fetchFn = fakeFetch([
      { match: () => true, respond: () => new Response('nope', { status: 404 }) },
    ]);
    const http = new HttpClient({ userAgent: 't', fetchFn, sleep: noSleep });
    await expect(http.get('https://x.org/a', { source: 's', policy })).rejects.toMatchObject({
      status: 404,
    });
    const res = await http.get('https://x.org/a', { source: 's2', policy, acceptStatuses: [404] });
    expect(res.status).toBe(404);
  });

  it('sends validators, returns notModified on 304, and only commits after success', async () => {
    let call = 0;
    const fetchFn = fakeFetch([
      {
        match: () => true,
        respond: (_u, init) => {
          call++;
          const h = init.headers as Record<string, string>;
          if (h['If-None-Match'] === '"v1"') return new Response(null, { status: 304 });
          return new Response('<rss/>', {
            headers: { ETag: '"v1"', 'Last-Modified': 'Sat, 24 Oct 2026 21:00:01 GMT' },
          });
        },
      },
    ]);
    const cache = new ConditionalCache();
    const http = new HttpClient({ userAgent: 't', fetchFn, sleep: noSleep, cache });
    const url = 'https://feeds.example.org/a.xml';
    const first = await http.get(url, { source: 'rss', policy, conditional: true });
    expect(first.notModified).toBe(false);
    // Not committed yet: a crash here must not cause a 304 next time.
    expect(cache.get(url)).toBeUndefined();
    cache.commit('rss');
    expect(cache.get(url)?.etag).toBe('"v1"');
    const second = await http.get(url, { source: 'rss', policy, conditional: true });
    expect(second.notModified).toBe(true);
    expect(fetchFn.calls[1]!.headers['If-Modified-Since']).toBe('Sat, 24 Oct 2026 21:00:01 GMT');
    expect(call).toBe(2);
  });

  it('enforces robots.txt for feed requests', async () => {
    const fetchFn = fakeFetch([
      {
        match: (u) => u.endsWith('/robots.txt'),
        respond: () => new Response('User-agent: *\nDisallow: /private/'),
      },
      { match: () => true, respond: () => new Response('<rss/>') },
    ]);
    const http = new HttpClient({ userAgent: 't', fetchFn, sleep: noSleep });
    await expect(
      http.get('https://site.example/private/feed.xml', { source: 'rss', policy, robots: true }),
    ).rejects.toBeInstanceOf(RobotsDisallowedError);
    const ok = await http.get('https://site.example/rss-feed/chem/', {
      source: 'rss',
      policy,
      robots: true,
    });
    expect(ok.text).toBe('<rss/>');
  });

  it('parses Retry-After seconds and dates', () => {
    expect(parseRetryAfter('5', 0)).toBe(5000);
    expect(
      parseRetryAfter('Sat, 24 Oct 2026 21:00:10 GMT', Date.parse('Sat, 24 Oct 2026 21:00:00 GMT')),
    ).toBe(10_000);
    expect(parseRetryAfter(null, 0)).toBeUndefined();
  });
});

describe('robots.txt', () => {
  const robots = parseRobots(`
User-agent: *
Allow: /
Disallow: /search/
Disallow: /rss-feed/search/
Disallow: /*/sort/

User-Agent: ClaudeBot
User-Agent: GPTBot
Disallow: /news/
`);

  it('uses the wildcard group for our token and applies longest match', () => {
    expect(isAllowed(robots, 'ChemBridge', '/rss-feed/chemistry-news/')).toBe(true);
    expect(isAllowed(robots, 'ChemBridge', '/rss-feed/search/foo')).toBe(false);
    expect(isAllowed(robots, 'ChemBridge', '/a/sort/b')).toBe(false);
    expect(isAllowed(robots, 'ChemBridge', '/news/x')).toBe(true);
  });

  it('selects a specific group when the token matches', () => {
    expect(isAllowed(robots, 'GPTBot', '/news/x')).toBe(false);
  });

  it('treats an empty Disallow as allow-all and honours $', () => {
    const r = parseRobots('User-agent: *\nDisallow:\nDisallow: /*.pdf$');
    expect(isAllowed(r, 'x', '/anything')).toBe(true);
    expect(isAllowed(r, 'x', '/paper.pdf')).toBe(false);
    expect(isAllowed(r, 'x', '/paper.pdf?x=1')).toBe(true);
  });
});
