/**
 * Minimal robots.txt support (RFC 9309): group selection by product token, Allow/Disallow with
 * `*` and `$`, longest match wins, Allow wins ties.
 */
import { readJson, writeJson } from '../fsutil.ts';

interface Rule {
  allow: boolean;
  pattern: string;
}

interface Group {
  agents: string[];
  rules: Rule[];
}

export interface RobotsRules {
  groups: Group[];
}

export function parseRobots(text: string): RobotsRules {
  const groups: Group[] = [];
  let current: Group | undefined;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (field === 'user-agent') {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === 'allow' || field === 'disallow') {
      // An empty Disallow means "allow everything" and adds no rule.
      if (field === 'disallow' && value === '') continue;
      current.rules.push({ allow: field === 'allow', pattern: value });
    }
  }
  return { groups };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = (anchored ? pattern.slice(0, -1) : pattern)
    .split('*')
    .map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp('^' + body + (anchored ? '$' : ''));
}

export function isAllowed(
  rules: RobotsRules,
  productToken: string,
  pathWithQuery: string,
): boolean {
  const token = productToken.toLowerCase();
  const specific = rules.groups.filter((g) => g.agents.some((a) => a !== '*' && token.includes(a)));
  const chosen = specific.length ? specific : rules.groups.filter((g) => g.agents.includes('*'));
  if (!chosen.length) return true;
  let best: { len: number; allow: boolean } | undefined;
  for (const g of chosen) {
    for (const r of g.rules) {
      if (!patternToRegExp(r.pattern).test(pathWithQuery)) continue;
      const len = r.pattern.length;
      if (!best || len > best.len || (len === best.len && r.allow)) best = { len, allow: r.allow };
    }
  }
  return best ? best.allow : true;
}

interface CachedRobots {
  fetchedAt: string;
  status: number;
  body: string;
}

export type RobotsFetcher = (url: string) => Promise<{ status: number; text: string }>;

/** Fetches and caches robots.txt per origin for 24 hours. */
export class RobotsChecker {
  private cache: Record<string, CachedRobots>;
  private readonly ttlMs = 24 * 3600 * 1000;

  constructor(
    private readonly fetcher: RobotsFetcher,
    private readonly productToken: string,
    private readonly path?: string,
    private readonly now: () => number = Date.now,
  ) {
    this.cache = path ? readJson<Record<string, CachedRobots>>(path, {}) : {};
  }

  async allowed(url: string): Promise<boolean> {
    const u = new URL(url);
    const origin = u.origin;
    let entry = this.cache[origin];
    if (!entry || this.now() - Date.parse(entry.fetchedAt) > this.ttlMs) {
      try {
        const res = await this.fetcher(`${origin}/robots.txt`);
        entry = {
          fetchedAt: new Date(this.now()).toISOString(),
          status: res.status,
          body: res.text,
        };
      } catch {
        entry = { fetchedAt: new Date(this.now()).toISOString(), status: 503, body: '' };
      }
      this.cache[origin] = entry;
    }
    // RFC 9309: 4xx → no restrictions; 5xx / unreachable → assume complete disallow.
    if (entry.status >= 400 && entry.status < 500) return true;
    if (entry.status >= 500) return false;
    return isAllowed(parseRobots(entry.body), this.productToken, u.pathname + u.search);
  }

  save(): void {
    if (this.path) writeJson(this.path, this.cache, true);
  }
}
