/**
 * Vector utilities shared by the pipeline (related developments, topic clusters) and the
 * browser. Embeddings come from MiniLM when available; `hashedTfidf` is the offline fallback.
 */
import { fnv1a32 } from './ids.ts';

const TOKEN_STOP = new Set(
  'the of and a an in on for to with by from at as is are be we our this that these those using via based into its their which can was were has have not but also than more most such between within over under new approach method results show study'.split(
    ' ',
  ),
);

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9+-]+/)
    .filter((t) => t.length > 2 && !TOKEN_STOP.has(t) && !/^\d+$/.test(t));
}

export function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i]! * v[i]!;
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i]! /= n;
  return v;
}

export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i]! * b[i]!;
  return s;
}

/**
 * TF-IDF with the hashing trick into `dims` buckets (unigrams + bigrams), L2-normalized.
 * Deterministic and dependency-free, so it works offline and in the browser.
 */
export function hashedTfidf(texts: string[], dims = 1024): Float32Array[] {
  const docs = texts.map((t) => {
    const toks = tokenize(t);
    const grams = [...toks];
    for (let i = 0; i + 1 < toks.length; i++) grams.push(`${toks[i]}_${toks[i + 1]}`);
    return grams;
  });
  const df = new Map<string, number>();
  for (const d of docs) for (const g of new Set(d)) df.set(g, (df.get(g) ?? 0) + 1);
  const n = docs.length;
  return docs.map((d) => {
    const v = new Float32Array(dims);
    const tf = new Map<string, number>();
    for (const g of d) tf.set(g, (tf.get(g) ?? 0) + 1);
    for (const [g, c] of tf) {
      const idf = Math.log((1 + n) / (1 + (df.get(g) ?? 0))) + 1;
      const h = fnv1a32(g);
      const sign = h & 1 ? 1 : -1;
      v[h % dims]! += sign * (1 + Math.log(c)) * idf;
    }
    return normalize(v);
  });
}

/** Top-k neighbours by cosine similarity (vectors must be normalized). */
export function topK(
  vectors: Float32Array[],
  k: number,
  minSim = 0.3,
  candidates?: (i: number) => Iterable<number>,
): Array<Array<{ j: number; sim: number }>> {
  return vectors.map((vi, i) => {
    const best: Array<{ j: number; sim: number }> = [];
    const pool = candidates ? candidates(i) : vectors.keys();
    for (const j of pool) {
      if (j === i) continue;
      const sim = dot(vi, vectors[j]!);
      if (sim < minSim) continue;
      if (best.length < k) {
        best.push({ j, sim });
        best.sort((a, b) => b.sim - a.sim);
      } else if (sim > best[k - 1]!.sim) {
        best[k - 1] = { j, sim };
        best.sort((a, b) => b.sim - a.sim);
      }
    }
    return best;
  });
}

/**
 * Leader clustering: visit items in priority order, join the first leader within `threshold`
 * cosine similarity or become a new leader. O(n · leaders), good enough for ~10k items.
 */
export function leaderClusters(
  vectors: Float32Array[],
  order: number[],
  threshold: number,
): number[] {
  const assignment = new Array<number>(vectors.length).fill(-1);
  const leaders: number[] = [];
  for (const i of order) {
    let bestLeader = -1;
    let bestSim = threshold;
    for (const l of leaders) {
      const s = dot(vectors[i]!, vectors[l]!);
      if (s >= bestSim) {
        bestSim = s;
        bestLeader = l;
      }
    }
    if (bestLeader === -1) {
      leaders.push(i);
      assignment[i] = i;
    } else {
      assignment[i] = bestLeader;
    }
  }
  return assignment;
}

/** Int8 quantization for compact storage of unit vectors. */
export function quantize(v: Float32Array): Int8Array {
  const q = new Int8Array(v.length);
  for (let i = 0; i < v.length; i++) q[i] = Math.max(-127, Math.min(127, Math.round(v[i]! * 127)));
  return q;
}

export function dequantize(q: Int8Array): Float32Array {
  const v = new Float32Array(q.length);
  for (let i = 0; i < q.length; i++) v[i] = q[i]! / 127;
  return normalize(v);
}

/** Most distinctive terms of a group of texts versus the whole corpus (for cluster labels). */
export function distinctiveTerms(
  groupTexts: string[],
  corpusDf: Map<string, number>,
  corpusSize: number,
  k = 3,
): string[] {
  const tf = new Map<string, number>();
  for (const t of groupTexts)
    for (const tok of new Set(tokenize(t))) tf.set(tok, (tf.get(tok) ?? 0) + 1);
  return [...tf.entries()]
    .filter(([, c]) => c >= Math.max(2, groupTexts.length * 0.3))
    .map(([tok, c]) => ({
      tok,
      s: (c / groupTexts.length) * Math.log(corpusSize / (1 + (corpusDf.get(tok) ?? 0))),
    }))
    .sort((a, b) => b.s - a.s)
    .slice(0, k)
    .map((x) => x.tok);
}

export function documentFrequency(texts: string[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const t of texts)
    for (const tok of new Set(tokenize(t))) df.set(tok, (df.get(tok) ?? 0) + 1);
  return df;
}
