import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const here = dirname(fileURLToPath(import.meta.url));
export const PIPELINE_ROOT = resolve(here, '..');
export const REPO_ROOT = resolve(PIPELINE_ROOT, '..', '..');
export const VERSION = '0.1.0';

const Feed = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  url: z.string().url(),
  type: z.enum(['article', 'news']),
  chemistry: z.boolean(),
});

const Journal = z.object({
  issn: z.string().regex(/^\d{4}-\d{3}[\dX]$/),
  name: z.string(),
  chemistry: z.boolean().default(true),
});

const ConfigSchema = z.object({
  backfillDays: z.number().int().positive(),
  retentionDays: z.number().int().positive(),
  overlapDays: z.number().int().min(0),
  rawRetentionDays: z.number().int().min(0),
  publish: z.object({
    minScore: z.number().min(0).max(100),
    minScoreNews: z.number().min(0).max(100),
    maxItems: z.number().int().positive(),
    buckets: z.number().int().positive(),
    excerptChars: z.number().int().positive(),
    feedItems: z.number().int().positive(),
    feedDays: z.number().int().positive(),
    weeklyTop: z.number().int().positive(),
  }),
  sources: z.object({
    arxiv: z.object({
      enabled: z.boolean(),
      pageSize: z.number().int().min(1).max(2000),
      chemCategories: z.array(z.string()),
      csCategories: z.array(z.string()),
      queries: z.array(z.object({ id: z.string(), search: z.string() })),
    }),
    chemrxiv: z.object({
      enabled: z.boolean(),
      pageSize: z.number().int().min(1).max(1000),
      doiPrefix: z.string(),
    }),
    biorxiv: z.object({
      enabled: z.boolean(),
      server: z.string(),
      categories: z.array(z.string()),
    }),
    medrxiv: z.object({
      enabled: z.boolean(),
      server: z.string(),
      categories: z.array(z.string()),
    }),
    europepmc: z.object({
      enabled: z.boolean(),
      pageSize: z.number().int().min(1).max(1000),
      query: z.string(),
    }),
    'crossref-journals': z.object({
      enabled: z.boolean(),
      pageSize: z.number().int().min(1).max(1000),
      journals: z.array(Journal),
    }),
    rss: z.object({ enabled: z.boolean(), feeds: z.array(Feed) }),
  }),
  enrich: z.object({
    openalex: z.object({ enabled: z.boolean(), maxPerRun: z.number().int().min(0) }),
    semanticscholar: z.object({ enabled: z.boolean(), maxPerRun: z.number().int().min(0) }),
    pubchem: z.object({ enabled: z.boolean(), maxLookupsPerRun: z.number().int().min(0) }),
    github: z.object({ enabled: z.boolean(), maxPerRun: z.number().int().min(0) }),
    hn: z.object({ enabled: z.boolean(), maxPerRun: z.number().int().min(0) }),
  }),
  embeddings: z.object({
    provider: z.enum(['minilm', 'tfidf']),
    model: z.string(),
    relatedK: z.number().int().min(0),
    clusterThreshold: z.number().min(0).max(1),
  }),
});

export type PipelineConfig = z.infer<typeof ConfigSchema>;
export type FeedConfig = z.infer<typeof Feed>;
export type JournalConfig = z.infer<typeof Journal>;

/** Runtime settings that come from the environment rather than the committed config. */
export interface RuntimeEnv {
  dataDir: string;
  contactEmail?: string | undefined;
  siteUrl?: string | undefined;
  openalexApiKey?: string | undefined;
  s2ApiKey?: string | undefined;
  githubToken?: string | undefined;
}

export function loadConfig(path = join(PIPELINE_ROOT, 'config', 'pipeline.json')): PipelineConfig {
  const raw: unknown = JSON.parse(readFileSync(path, 'utf8'));
  return ConfigSchema.parse(raw);
}

export function loadRuntimeEnv(overrides: Partial<RuntimeEnv> = {}): RuntimeEnv {
  const env = process.env;
  const blank = (v: string | undefined) => (v && v.trim() ? v.trim() : undefined);
  return {
    dataDir: resolve(
      overrides.dataDir ?? blank(env.CHEMBRIDGE_DATA_DIR) ?? join(REPO_ROOT, '.data'),
    ),
    contactEmail: overrides.contactEmail ?? blank(env.CONTACT_EMAIL),
    siteUrl: overrides.siteUrl ?? blank(env.SITE_URL),
    openalexApiKey: overrides.openalexApiKey ?? blank(env.OPENALEX_API_KEY),
    s2ApiKey: overrides.s2ApiKey ?? blank(env.S2_API_KEY),
    githubToken: overrides.githubToken ?? blank(env.GITHUB_TOKEN),
  };
}

export function userAgent(env: RuntimeEnv): string {
  const site = env.siteUrl ?? 'https://github.com/chembridge/chembridge';
  const mail = env.contactEmail ? `; mailto:${env.contactEmail}` : '';
  return `ChemBridge/${VERSION} (+${site}${mail})`;
}
