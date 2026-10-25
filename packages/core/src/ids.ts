/**
 * Identifier normalization used for deduplication: DOI → arXiv ID → normalized title.
 */

const DOI_RE = /10\.\d{4,9}\/[^\s"'<>]+/i;

/** Lower-cases a DOI and strips resolver prefixes and trailing punctuation. */
export function normalizeDoi(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const m = DOI_RE.exec(decodeURIComponentSafe(input.trim()));
  if (!m) return undefined;
  let doi = m[0].toLowerCase().replace(/[.,;:)\]}]+$/, '');
  // arXiv's own DOIs (10.48550/arXiv.<id>) identify the preprint, not a version of record.
  if (doi.startsWith('10.48550/arxiv.')) return doi;
  // ChemRxiv mints one DOI per version, old style `…-v2` and new style `…/v2`;
  // all versions are the same development.
  if (doi.startsWith('10.26434/')) doi = doi.replace(/(?:-|\/)v\d+$/, '');
  return doi;
}

/** Extracts a DOI from free text (e.g. an RSS description), or undefined. */
export function findDoi(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const m = DOI_RE.exec(text);
  return m ? normalizeDoi(m[0]) : undefined;
}

const ARXIV_NEW = /(\d{4}\.\d{4,5})(v\d+)?/;
const ARXIV_OLD = /([a-z-]+(?:\.[A-Z]{2})?\/\d{7})(v\d+)?/;

/** `http://arxiv.org/abs/2610.01234v2` → `2610.01234`; old-style ids are kept with their archive. */
export function normalizeArxivId(input: string | undefined | null): string | undefined {
  if (!input) return undefined;
  const s = input.trim();
  const fromDoi = /10\.48550\/arxiv\.(.+)$/i.exec(s);
  const candidate = fromDoi ? fromDoi[1]! : s;
  const m = ARXIV_NEW.exec(candidate) ?? ARXIV_OLD.exec(candidate);
  return m ? m[1] : undefined;
}

/** Title key: accents, markup, punctuation and case removed. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .replace(/\\[a-zA-Z]+\{([^}]*)\}/g, '$1')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Titles shorter than this are too generic ("Editorial") to be used as a dedup key. */
export const MIN_TITLE_KEY_LENGTH = 24;

export function titleKey(title: string): string | undefined {
  const key = normalizeTitle(title);
  return key.length >= MIN_TITLE_KEY_LENGTH ? key : undefined;
}

/** 64-bit FNV-1a, returned as a base-36 string. Stable across runtimes. */
export function fnv1a64(input: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const bytes = new TextEncoder().encode(input);
  for (const b of bytes) {
    hash ^= BigInt(b);
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash.toString(36);
}

/** 32-bit FNV-1a as a number, for cheap bucketing. */
export function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export interface IdentityKeys {
  doi?: string | undefined;
  arxivId?: string | undefined;
  title: string;
  url: string;
}

/** Canonical key in dedup priority order; the record id is derived from it. */
export function canonicalKey(keys: IdentityKeys): string {
  if (keys.doi && !keys.doi.startsWith('10.48550/')) return `doi:${keys.doi}`;
  const arxiv = keys.arxivId ?? normalizeArxivId(keys.doi);
  if (arxiv) return `arxiv:${arxiv}`;
  const t = titleKey(keys.title);
  if (t) return `title:${t}`;
  return `url:${keys.url}`;
}

/** Short, URL-safe, stable record id. */
export function developmentId(keys: IdentityKeys): string {
  return fnv1a64(canonicalKey(keys));
}

/** Bucket index for sharded detail files. */
export function bucketOf(id: string, buckets: number): number {
  return fnv1a32(id) % buckets;
}

function decodeURIComponentSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}
