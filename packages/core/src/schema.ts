/**
 * ChemBridge domain model.
 *
 * This file is the single source of truth for every record that flows through the pipeline
 * and is published to the web app. `pnpm schema:export` writes the same model as JSON Schema
 * (packages/core/schema/*.json) so that a non-TypeScript backend (Option B, Java) can share it.
 */
import { z } from 'zod';

export const I18nTextSchema = z.object({ tr: z.string(), en: z.string() });
export type I18nText = z.infer<typeof I18nTextSchema>;

export const DevelopmentTypeSchema = z.enum(['preprint', 'article', 'news']);
export type DevelopmentType = z.infer<typeof DevelopmentTypeSchema>;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD');

/** Where a record was seen. A deduplicated record keeps one ref per source. */
export const SourceRefSchema = z.object({
  source: z.string().min(1),
  nativeId: z.string().min(1),
  url: z.string().min(1),
  fetchedAt: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const ArtifactKindSchema = z.enum(['code', 'data', 'model']);
export type ArtifactKind = z.infer<typeof ArtifactKindSchema>;

export const ArtifactLinkSchema = z.object({
  url: z.string(),
  kind: ArtifactKindSchema,
  host: z.string(),
});
export type ArtifactLink = z.infer<typeof ArtifactLinkSchema>;

/** A normalized development (preprint, article or news item), independent of its source. */
export const DevelopmentSchema = z.object({
  id: z.string().min(1),
  doi: z.string().optional(),
  arxivId: z.string().optional(),
  title: z.string().min(1),
  /** Abstract text. Full only when the source licence allows redistribution, else an excerpt. */
  abstract: z.string(),
  abstractIsExcerpt: z.boolean(),
  authors: z.array(z.string()),
  publishedAt: isoDate,
  type: DevelopmentTypeSchema,
  venue: z.string(),
  url: z.string().min(1),
  license: z.string().optional(),
  primarySource: z.string(),
  sources: z.array(SourceRefSchema).min(1),
  /** Source-native classification, prefixed, e.g. `arxiv:physics.chem-ph`, `biorxiv:biochemistry`. */
  topics: z.array(z.string()),
  keywords: z.array(z.string()),
  links: z.array(ArtifactLinkSchema),
  /** True when the source itself is chemistry-specific (ChemRxiv, chemistry journals, ...). */
  chemistrySource: z.boolean(),
  ingestedAt: z.string(),
});
export type Development = z.infer<typeof DevelopmentSchema>;

export const ScoreComponentIdSchema = z.enum([
  'csTechniques',
  'dataIntensity',
  'openArtifacts',
  'problemType',
  'penalty',
]);
export type ScoreComponentId = z.infer<typeof ScoreComponentIdSchema>;

/** One explainable contribution to the score: which rule, what text matched, how many points. */
export const ScoreReasonSchema = z.object({
  component: ScoreComponentIdSchema,
  rule: z.string(),
  match: z.string(),
  field: z.enum(['title', 'abstract', 'meta', 'enrichment']),
  points: z.number(),
});
export type ScoreReason = z.infer<typeof ScoreReasonSchema>;

export const ComponentScoreSchema = z.object({ score: z.number(), max: z.number() });

export const ScoreBreakdownSchema = z.object({
  total: z.number().int().min(0).max(100),
  components: z.object({
    csTechniques: ComponentScoreSchema,
    dataIntensity: ComponentScoreSchema,
    openArtifacts: ComponentScoreSchema,
    problemType: ComponentScoreSchema,
    penalty: ComponentScoreSchema,
  }),
  reasons: z.array(ScoreReasonSchema),
  rulesVersion: z.number().int(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const TaxonomyHitSchema = z.object({
  id: z.string(),
  confidence: z.number(),
  evidence: z.array(z.string()),
  /** Inferred hits are CS sub-fields the work does not use yet but is a good fit for. */
  inferred: z.boolean(),
});
export type TaxonomyHit = z.infer<typeof TaxonomyHitSchema>;

/** A cell of the chemistry × CS matrix. */
export const CellSchema = z.object({
  chem: z.string(),
  cs: z.string(),
  weight: z.number(),
  inferred: z.boolean(),
});
export type Cell = z.infer<typeof CellSchema>;

export const CompoundSchema = z.object({
  name: z.string(),
  cid: z.number().int(),
  formula: z.string().optional(),
  title: z.string().optional(),
  url: z.string(),
});
export type Compound = z.infer<typeof CompoundSchema>;

export const GithubRepoSchema = z.object({
  name: z.string(),
  url: z.string(),
  stars: z.number().int(),
  description: z.string().optional(),
  pushedAt: z.string().optional(),
});
export type GithubRepo = z.infer<typeof GithubRepoSchema>;

export const HnStorySchema = z.object({
  title: z.string(),
  url: z.string().optional(),
  hnUrl: z.string(),
  points: z.number().int(),
  comments: z.number().int(),
  createdAt: z.string(),
});
export type HnStory = z.infer<typeof HnStorySchema>;

export const EnrichmentSchema = z.object({
  compounds: z.array(CompoundSchema).optional(),
  github: z
    .object({
      query: z.string(),
      total: z.number().int(),
      repos: z.array(GithubRepoSchema),
      checkedAt: z.string(),
    })
    .optional(),
  hn: z
    .object({ query: z.string(), stories: z.array(HnStorySchema), checkedAt: z.string() })
    .optional(),
  openalex: z
    .object({
      id: z.string(),
      topic: z.string().optional(),
      subfield: z.string().optional(),
      field: z.string().optional(),
      keywords: z.array(z.string()),
    })
    .optional(),
  s2: z
    .object({
      paperId: z.string(),
      url: z.string(),
      tldr: z.string().optional(),
      citationCount: z.number().int().optional(),
    })
    .optional(),
});
export type Enrichment = z.infer<typeof EnrichmentSchema>;

export const ProblemTypeSchema = z.enum([
  'prediction',
  'optimization',
  'classification',
  'control',
  'discovery',
]);
export type ProblemType = z.infer<typeof ProblemTypeSchema>;

/** A development after scoring, taxonomy mapping and enrichment. */
export const AnalyzedDevelopmentSchema = DevelopmentSchema.extend({
  score: ScoreBreakdownSchema,
  chem: z.array(TaxonomyHitSchema),
  cs: z.array(TaxonomyHitSchema),
  cells: z.array(CellSchema),
  problemTypes: z.array(ProblemTypeSchema),
  /** Rule ids of data / artifact signals that fired (used for inference and idea generation). */
  signals: z.array(z.string()),
  enrichment: EnrichmentSchema,
  related: z.array(z.string()),
  cluster: z.string().optional(),
});
export type AnalyzedDevelopment = z.infer<typeof AnalyzedDevelopmentSchema>;

export const IdeaDirectionSchema = z.enum(['academic', 'portfolio', 'startup']);
export type IdeaDirection = z.infer<typeof IdeaDirectionSchema>;

export const IdeaLayerSchema = z.enum(['A', 'B', 'C']);
export type IdeaLayer = z.infer<typeof IdeaLayerSchema>;

export const IdeaSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  templateId: z.string(),
  direction: IdeaDirectionSchema,
  layer: IdeaLayerSchema,
  cell: z.object({ chem: z.string(), cs: z.string(), inferred: z.boolean() }),
  title: I18nTextSchema,
  summary: I18nTextSchema,
  researchQuestion: I18nTextSchema,
  method: z.array(I18nTextSchema),
  evaluation: I18nTextSchema,
  difficulty: z.number().int().min(1).max(5),
  requiredData: z.array(z.object({ name: z.string(), url: z.string().optional() })),
  stack: z.array(z.string()),
  whyNow: z.array(I18nTextSchema),
  venues: z.array(z.string()),
  similar: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      kind: z.enum(['corpus', 'github', 'hn', 'source']),
    }),
  ),
});
export type Idea = z.infer<typeof IdeaSchema>;

// ---------------------------------------------------------------------------------------------
// Published (static JSON) formats consumed by the web app.
// ---------------------------------------------------------------------------------------------

/** Compact row of `index.json`, enough to render a card and filter. */
export const IndexEntrySchema = z.object({
  id: z.string(),
  title: z.string(),
  date: isoDate,
  source: z.string(),
  type: DevelopmentTypeSchema,
  venue: z.string(),
  score: z.number().int(),
  chem: z.array(z.string()),
  cs: z.array(z.string()),
  csInferred: z.array(z.string()),
  /** Matrix cells as `chem|cs`, so a cell filter matches exactly what the matrix counts. */
  cells: z.array(z.string()),
  code: z.boolean(),
  data: z.boolean(),
  bucket: z.number().int(),
});
export type IndexEntry = z.infer<typeof IndexEntrySchema>;

/**
 * Detail record stored in `items/<bucket>.json`. Only a short excerpt of the abstract is
 * published, never the full text.
 */
export const DetailEntrySchema = AnalyzedDevelopmentSchema.omit({
  ingestedAt: true,
  sources: true,
  abstract: true,
}).extend({
  sources: z.array(SourceRefSchema.omit({ fetchedAt: true })),
  abstractExcerpt: z.string(),
});
export type DetailEntry = z.infer<typeof DetailEntrySchema>;

export const SourceRunReportSchema = z.object({
  source: z.string(),
  ok: z.boolean(),
  fetched: z.number().int(),
  normalized: z.number().int(),
  notModified: z.boolean(),
  requests: z.number().int(),
  durationMs: z.number().int(),
  error: z.string().optional(),
  window: z.object({ from: isoDate, to: isoDate }).optional(),
  finishedAt: z.string(),
});
export type SourceRunReport = z.infer<typeof SourceRunReportSchema>;

export const MetaSchema = z.object({
  generatedAt: z.string(),
  rulesVersion: z.number().int(),
  window: z.object({ from: isoDate, to: isoDate }),
  counts: z.object({ corpus: z.number().int(), published: z.number().int() }),
  buckets: z.number().int(),
  sources: z.array(SourceRunReportSchema),
  enrichment: z
    .record(
      z.string(),
      z.object({
        lookups: z.number().int(),
        hits: z.number().int(),
        skipped: z.string().optional(),
      }),
    )
    .optional(),
  embeddings: z.string(),
  siteUrl: z.string().optional(),
});
export type Meta = z.infer<typeof MetaSchema>;

export const CellStatSchema = z.object({
  chem: z.string(),
  cs: z.string(),
  count: z.number().int(),
  countExisting: z.number().int(),
  countInferred: z.number().int(),
  avgScore: z.number(),
  maxScore: z.number(),
  recent: z.number().int(),
  previous: z.number().int(),
  growth: z.number(),
  weekly: z.array(z.number().int()),
  rising: z.boolean(),
  quietPromising: z.boolean(),
  topIds: z.array(z.string()),
});
export type CellStat = z.infer<typeof CellStatSchema>;

export const ClusterSchema = z.object({
  id: z.string(),
  label: z.array(z.string()),
  size: z.number().int(),
  avgScore: z.number(),
  recent: z.number().int(),
  topIds: z.array(z.string()),
});
export type Cluster = z.infer<typeof ClusterSchema>;

export const TrendsSchema = z.object({
  generatedAt: z.string(),
  weeks: z.array(z.string()),
  months: z.array(z.string()),
  recentWeeks: z.number().int(),
  cells: z.array(CellStatSchema),
  chemTotals: z.record(z.string(), z.array(z.number().int())),
  csTotals: z.record(z.string(), z.array(z.number().int())),
  monthly: z.record(z.string(), z.array(z.number().int())),
  clusters: z.array(ClusterSchema),
});
export type Trends = z.infer<typeof TrendsSchema>;

export const WeeklyDigestSchema = z.object({
  week: z.string(),
  from: isoDate,
  to: isoDate,
  total: z.number().int(),
  bySource: z.record(z.string(), z.number().int()),
  topIds: z.array(z.string()),
  rising: z.array(
    z.object({ chem: z.string(), cs: z.string(), recent: z.number(), growth: z.number() }),
  ),
  quiet: z.array(
    z.object({ chem: z.string(), cs: z.string(), count: z.number(), avgScore: z.number() }),
  ),
});
export type WeeklyDigest = z.infer<typeof WeeklyDigestSchema>;

/** Exported for `scripts/export-json-schema.ts`. */
export const PUBLIC_SCHEMAS = {
  Development: DevelopmentSchema,
  AnalyzedDevelopment: AnalyzedDevelopmentSchema,
  Idea: IdeaSchema,
  IndexEntry: IndexEntrySchema,
  DetailEntry: DetailEntrySchema,
  Meta: MetaSchema,
  Trends: TrendsSchema,
  WeeklyDigest: WeeklyDigestSchema,
} as const;
