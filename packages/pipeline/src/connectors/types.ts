import type { Development } from '@chembridge/core';
import type { PipelineConfig, RuntimeEnv } from '../config.ts';
import type { HttpClient, RequestPolicy } from '../http/client.ts';
import type { Logger } from '../log.ts';

export interface CollectWindow {
  /** Inclusive, YYYY-MM-DD (UTC). */
  from: string;
  to: string;
}

export interface ConnectorContext {
  http: HttpClient;
  config: PipelineConfig;
  env: RuntimeEnv;
  log: Logger;
  now: Date;
}

export interface ConnectorResult {
  records: Development[];
  /** Raw items seen before normalization/filtering. */
  fetched: number;
  /** True when every request of the run was answered with 304 Not Modified. */
  notModified: boolean;
  /** Per-sub-source problems that did not abort the whole connector (e.g. one feed failed). */
  warnings: string[];
}

export interface Connector {
  id: string;
  label: string;
  /** `api` sources follow their API terms; `feed` sources are web resources subject to robots.txt. */
  kind: 'api' | 'feed';
  /** Feeds only expose their latest items and cannot fetch historic windows. */
  supportsBackfill: boolean;
  enabled(config: PipelineConfig): boolean;
  collect(ctx: ConnectorContext, window: CollectWindow): Promise<ConnectorResult>;
}

/** Shared request policies; numbers follow each provider's published limits (docs/SOURCES.md). */
export const POLICIES = {
  arxiv: { minIntervalMs: 3100, timeoutMs: 90_000, retries: 4 },
  crossrefList: (polite: boolean): RequestPolicy => ({
    minIntervalMs: polite ? 400 : 1100,
    timeoutMs: 90_000,
    retries: 4,
  }),
  crossrefSingle: (polite: boolean): RequestPolicy => ({
    minIntervalMs: polite ? 150 : 250,
    timeoutMs: 30_000,
    retries: 3,
  }),
  biorxiv: { minIntervalMs: 1000, timeoutMs: 60_000, retries: 4 },
  europepmc: { minIntervalMs: 1000, timeoutMs: 120_000, retries: 4 },
  feed: { minIntervalMs: 1500, timeoutMs: 30_000, retries: 2 },
  openalex: { minIntervalMs: 200, timeoutMs: 30_000, retries: 2, maxRetryAfterMs: 30_000 },
  semanticscholar: { minIntervalMs: 1100, timeoutMs: 60_000, retries: 3, maxRetryAfterMs: 60_000 },
  pubchem: { minIntervalMs: 250, timeoutMs: 35_000, retries: 2 },
  hn: { minIntervalMs: 1000, timeoutMs: 20_000, retries: 2 },
  github: (authenticated: boolean): RequestPolicy => ({
    minIntervalMs: authenticated ? 2200 : 6500,
    timeoutMs: 20_000,
    retries: 1,
    maxRetryAfterMs: 70_000,
  }),
} as const satisfies Record<string, RequestPolicy | ((x: boolean) => RequestPolicy)>;
