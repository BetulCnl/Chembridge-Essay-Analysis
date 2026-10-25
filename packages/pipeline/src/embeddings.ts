/**
 * Sentence embeddings for "related developments" and topic clusters.
 * Default: Transformers.js running Xenova/all-MiniLM-L6-v2 (ONNX, CPU) inside the pipeline.
 * Fallback: hashed TF-IDF from @chembridge/core when the model cannot be loaded (offline, etc.).
 */
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { dequantize, hashedTfidf, normalize, quantize } from '@chembridge/core';
import { REPO_ROOT } from './config.ts';
import { readJsonl, toJsonl, writeFileAtomic } from './fsutil.ts';
import type { Runtime } from './runtime.ts';

export interface Embedder {
  name: string;
  /** Whether vectors are independent per text (cacheable). TF-IDF depends on the whole corpus. */
  cacheable: boolean;
  embed(texts: string[]): Promise<Float32Array[]>;
}

interface CachedVector {
  id: string;
  h: string;
  v: string;
}

export function textHash(s: string): string {
  return createHash('sha1').update(s).digest('base64url').slice(0, 16);
}

const tfidfEmbedder: Embedder = {
  name: 'tfidf-hashed-1024',
  cacheable: false,
  embed: async (texts) => hashedTfidf(texts, 1024),
};

export async function createEmbedder(rt: Runtime): Promise<Embedder> {
  const cfg = rt.config.embeddings;
  if (cfg.provider === 'tfidf' || process.env.CHEMBRIDGE_EMBEDDINGS === 'tfidf')
    return tfidfEmbedder;
  try {
    const tf = await import('@huggingface/transformers');
    tf.env.cacheDir = process.env.TRANSFORMERS_CACHE ?? join(REPO_ROOT, '.cache', 'transformers');
    tf.env.allowRemoteModels = true;
    const extractor = await tf.pipeline('feature-extraction', cfg.model, { dtype: 'q8' });
    rt.log.info('embeddings: loaded model', { model: cfg.model });
    return {
      name: `minilm:${cfg.model}`,
      cacheable: true,
      async embed(texts) {
        const out: Float32Array[] = [];
        for (let i = 0; i < texts.length; i += 32) {
          const batch = texts.slice(i, i + 32);
          const tensor = await extractor(batch, { pooling: 'mean', normalize: true });
          const dims = tensor.dims[1] as number;
          const data = tensor.data as Float32Array;
          for (let j = 0; j < batch.length; j++)
            out.push(normalize(Float32Array.from(data.subarray(j * dims, (j + 1) * dims))));
          if (i % 1024 === 0 && i > 0) rt.log.info('embeddings', { done: i, total: texts.length });
        }
        return out;
      },
    };
  } catch (err) {
    rt.log.warn('embeddings: model unavailable, falling back to TF-IDF', {
      error: err instanceof Error ? err.message : String(err),
    });
    return tfidfEmbedder;
  }
}

/** Embeds `items`, reusing cached vectors whose text did not change. */
export async function embedAll(
  rt: Runtime,
  embedder: Embedder,
  items: Array<{ id: string; text: string }>,
): Promise<Float32Array[]> {
  if (!embedder.cacheable) return embedder.embed(items.map((i) => i.text));
  const file = rt.store.path(`embeddings-${embedder.name.replace(/[^a-z0-9]+/gi, '_')}.jsonl`);
  const cached = new Map(readJsonl<CachedVector>(file).map((c) => [c.id, c]));
  const hashes = items.map((i) => textHash(i.text));
  const missing = items
    .map((it, k) => ({ it, k }))
    .filter(({ it, k }) => cached.get(it.id)?.h !== hashes[k]);
  rt.log.info('embeddings', {
    model: embedder.name,
    cached: items.length - missing.length,
    toCompute: missing.length,
  });
  const fresh = missing.length ? await embedder.embed(missing.map((m) => m.it.text)) : [];
  const freshById = new Map(missing.map((m, j) => [m.it.id, fresh[j]!]));
  const rows: CachedVector[] = [];
  const vectors = items.map((it, k) => {
    const f = freshById.get(it.id);
    const v = f ?? dequantize(new Int8Array(Buffer.from(cached.get(it.id)!.v, 'base64')));
    rows.push({
      id: it.id,
      h: hashes[k]!,
      v: f ? Buffer.from(quantize(f).buffer).toString('base64') : cached.get(it.id)!.v,
    });
    return v;
  });
  writeFileAtomic(file, toJsonl(rows));
  return vectors;
}
