import type { ArtifactKind, ArtifactLink } from './schema.ts';

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  rsquo: '’',
  lsquo: '‘',
  rdquo: '”',
  ldquo: '“',
  deg: '°',
  times: '×',
  minus: '−',
  plusmn: '±',
  micro: 'µ',
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  Delta: 'Δ',
  pi: 'π',
  sigma: 'σ',
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (full, code: string) => {
    if (code[0] === '#') {
      const n =
        code[1] === 'x' || code[1] === 'X'
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : full;
    }
    return ENTITIES[code] ?? full;
  });
}

/** Inline formatting tags that sometimes arrive entity-escaped (e.g. `Li&lt;sup&gt;+&lt;/sup&gt;`). */
const ESCAPED_INLINE_TAG =
  /<\/?(sup|sub|i|b|em|strong|span|inf|sc|scp|u|small|mml:[a-z]+|math)\b[^<>]*>/gi;

/** Removes HTML/JATS markup and collapses whitespace. */
export function stripMarkup(input: string | undefined | null): string {
  if (!input) return '';
  return decodeEntities(
    input
      .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<jats:title>[\s\S]*?<\/jats:title>/gi, ' ')
      .replace(/<\/?(p|br|div|li|jats:p|jats:sec)[^>]*>/gi, ' ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(ESCAPED_INLINE_TAG, '')
    .replace(/\s+/g, ' ')
    .replace(/^(abstract|summary)[:.\s]+/i, '')
    .trim();
}

/** Cuts text at a word boundary, preferring a sentence end, and appends an ellipsis. */
export function excerpt(text: string, max = 600): string {
  if (text.length <= max) return text;
  const slice = text.slice(0, max);
  const sentenceEnd = Math.max(
    slice.lastIndexOf('. '),
    slice.lastIndexOf('? '),
    slice.lastIndexOf('! '),
  );
  if (sentenceEnd > max * 0.6) return slice.slice(0, sentenceEnd + 1);
  const space = slice.lastIndexOf(' ');
  return (space > max * 0.6 ? slice.slice(0, space) : slice).replace(/[,;:\s]+$/, '') + '…';
}

const URL_RE = /\bhttps?:\/\/[^\s<>"'()\]{}]+/gi;

const CODE_HOSTS = ['github.com', 'gitlab.com', 'bitbucket.org', 'codeberg.org', 'sourceforge.net'];
const DATA_HOSTS = [
  'zenodo.org',
  'figshare.com',
  'datadryad.org',
  'osf.io',
  'materialscloud.org',
  'data.mendeley.com',
  'dataverse.harvard.edu',
  'kaggle.com',
  'nomad-lab.eu',
  'pangaea.de',
];

function classifyHost(host: string, path: string): ArtifactKind | undefined {
  const h = host.replace(/^www\./, '');
  if (CODE_HOSTS.some((c) => h === c || h.endsWith('.' + c))) return 'code';
  if (h.endsWith('github.io')) return 'code';
  if (h === 'huggingface.co') return path.startsWith('/datasets') ? 'data' : 'model';
  if (DATA_HOSTS.some((d) => h === d || h.endsWith('.' + d))) return 'data';
  return undefined;
}

/** Finds code / data / model repository links in free text. */
export function extractArtifactLinks(...texts: Array<string | undefined>): ArtifactLink[] {
  const out = new Map<string, ArtifactLink>();
  for (const text of texts) {
    if (!text) continue;
    for (const raw of text.match(URL_RE) ?? []) {
      const url = raw.replace(/[.,;:!?]+$/, '');
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        continue;
      }
      const kind = classifyHost(parsed.hostname.toLowerCase(), parsed.pathname);
      if (!kind) continue;
      // Bare host links ("see github.com") carry no signal.
      if (parsed.pathname.replace(/\/+$/, '') === '') continue;
      const key = url.toLowerCase();
      if (!out.has(key)) out.set(key, { url, kind, host: parsed.hostname.replace(/^www\./, '') });
    }
  }
  return [...out.values()];
}

/** Also detects DOIs of data repositories (Zenodo 10.5281, Figshare 10.6084, Dryad 10.5061). */
export function dataDoiLinks(text: string | undefined): ArtifactLink[] {
  if (!text) return [];
  const out: ArtifactLink[] = [];
  const re = /\b10\.(5281|6084|5061)\/[^\s"'<>)]+/gi;
  for (const m of text.matchAll(re)) {
    const doi = m[0].replace(/[.,;:]+$/, '');
    const host =
      m[1] === '5281' ? 'zenodo.org' : m[1] === '6084' ? 'figshare.com' : 'datadryad.org';
    out.push({ url: `https://doi.org/${doi}`, kind: 'data', host });
  }
  return out;
}

const STOPWORDS = new Set(
  (
    'a an and are as at be based by can for from has have how in into is it its of on or our ' +
    'study that the their this through to toward towards using via we what when which with without ' +
    'new novel approach approaches method methods model models analysis framework system systems ' +
    'efficient effective high low large small improved enhanced towards between under over across ' +
    'role insights insight evidence case use application applications toward beyond design data ' +
    'learning machine deep neural network networks driven prediction predicting accurate fast ' +
    'via vs versus versatile general robust scalable simple first one two three multi'
  ).split(/\s+/),
);

/**
 * Lightweight keyphrase extraction: contiguous runs of non-stopwords from the title,
 * ranked by length and by how often their words recur in the abstract.
 */
export function extractKeyphrases(title: string, abstract = '', max = 6): string[] {
  const words = title
    .replace(/<[^>]+>/g, ' ')
    .replace(/\$[^$]*\$/g, ' ')
    .split(/[^A-Za-z0-9À-ɏ+\-–]+/)
    .filter(Boolean);
  const phrases: string[][] = [];
  let current: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (STOPWORDS.has(lw) || lw.length < 3 || /^\d+$/.test(lw)) {
      if (current.length) phrases.push(current);
      current = [];
    } else {
      current.push(w);
    }
  }
  if (current.length) phrases.push(current);
  const abs = abstract.toLowerCase();
  const scored = phrases
    .map((p) => p.slice(0, 4))
    .map((p) => {
      const freq = p.reduce((acc, w) => acc + countOccurrences(abs, w.toLowerCase()), 0);
      return { phrase: p.join(' '), score: p.length * 2 + Math.min(freq, 6) };
    })
    .sort((a, b) => b.score - a.score);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const { phrase } of scored) {
    const k = phrase.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(phrase);
    if (out.length >= max) break;
  }
  return out;
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n++;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/** Normalizes an author list to "Given Family" strings, dropping empties and duplicates. */
export function cleanAuthors(names: Array<string | undefined>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const n of names) {
    const v = (n ?? '').replace(/\s+/g, ' ').trim();
    if (!v || seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

/** Formats a JS Date (or parsable string) as YYYY-MM-DD in UTC; undefined if invalid. */
export function toIsoDate(input: string | number | Date | undefined | null): string | undefined {
  if (input === undefined || input === null || input === '') return undefined;
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}
