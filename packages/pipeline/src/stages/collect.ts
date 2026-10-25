import type { Development, SourceRunReport } from '@chembridge/core';
import { CONNECTORS } from '../connectors/index.ts';
import type { CollectWindow, Connector } from '../connectors/types.ts';
import { mergeDevelopments, type MergeStats } from '../dedup.ts';
import { persistHttpState, type Runtime } from '../runtime.ts';
import { addDays, todayUtc, type SourceCursor } from '../store.ts';

export interface CollectOptions {
  /** Restrict to these connector ids. */
  sources?: string[];
  /** Override the window: fetch the last N days regardless of cursors. */
  days?: number;
}

export interface CollectResult {
  reports: SourceRunReport[];
  merge: MergeStats;
  pruned: number;
}

export function computeWindow(
  connector: Connector,
  cursor: SourceCursor | undefined,
  today: string,
  backfillDays: number,
  overlapDays: number,
  overrideDays?: number,
): CollectWindow {
  const earliest = addDays(today, -backfillDays);
  if (overrideDays !== undefined) return { from: addDays(today, -overrideDays), to: today };
  if (!cursor || !connector.supportsBackfill)
    return { from: cursor ? addDays(cursor.lastSuccessTo, -overlapDays) : earliest, to: today };
  const resume = addDays(cursor.lastSuccessTo, -overlapDays);
  return { from: resume > earliest ? resume : earliest, to: today };
}

export async function collect(rt: Runtime, opts: CollectOptions = {}): Promise<CollectResult> {
  const { config, store, log } = rt;
  const today = todayUtc(rt.now);
  const cursors = store.readCursors();
  const reports: SourceRunReport[] = [];
  const incoming: Development[] = [];
  const selected = CONNECTORS.filter((c) =>
    opts.sources ? opts.sources.includes(c.id) : c.enabled(config),
  );

  for (const connector of selected) {
    const window = computeWindow(
      connector,
      cursors[connector.id],
      today,
      config.backfillDays,
      config.overlapDays,
      opts.days,
    );
    const started = Date.now();
    const httpSources = connector.id === 'rss' ? ['rss'] : [connector.id];
    const requestsBefore = httpSources.reduce((n, s) => n + rt.http.requestCount(s), 0);
    log.info(`collect ${connector.id}`, { window });
    try {
      const result = await connector.collect(
        { http: rt.http, config, env: rt.env, log: log.child(connector.id), now: rt.now },
        window,
      );
      incoming.push(...result.records);
      for (const s of httpSources) rt.http.cache.commit(s);
      cursors[connector.id] = { lastSuccessTo: window.to, lastRunAt: rt.now.toISOString() };
      reports.push({
        source: connector.id,
        ok: true,
        fetched: result.fetched,
        normalized: result.records.length,
        notModified: result.notModified,
        requests: httpSources.reduce((n, s) => n + rt.http.requestCount(s), 0) - requestsBefore,
        durationMs: Date.now() - started,
        ...(result.warnings.length ? { error: result.warnings.join(' | ') } : {}),
        window,
        finishedAt: new Date().toISOString(),
      });
      log.info(`collected ${connector.id}`, {
        fetched: result.fetched,
        normalized: result.records.length,
        warnings: result.warnings.length,
      });
    } catch (err) {
      for (const s of httpSources) rt.http.cache.discard(s);
      const message = err instanceof Error ? err.message : String(err);
      log.error(`collect ${connector.id} failed`, { error: message });
      reports.push({
        source: connector.id,
        ok: false,
        fetched: 0,
        normalized: 0,
        notModified: false,
        requests: httpSources.reduce((n, s) => n + rt.http.requestCount(s), 0) - requestsBefore,
        durationMs: Date.now() - started,
        error: message,
        window,
        finishedAt: new Date().toISOString(),
      });
    }
  }

  const existing = store.loadCorpus();
  const { records, stats } = mergeDevelopments(existing, incoming);
  const cutoff = addDays(today, -(config.retentionDays + 7));
  const kept = records.filter((r) => r.publishedAt >= cutoff && r.publishedAt <= addDays(today, 1));
  const pruned = records.length - kept.length;
  const saved = store.saveCorpus(kept);
  store.writeCursors(cursors);
  store.writeState('last-collect.json', reports, true);
  // Latest report per source, kept across partial runs (e.g. `--sources=europepmc`).
  const status = store.readState<Record<string, SourceRunReport>>('source-status.json', {});
  for (const r of reports) status[r.source] = r;
  store.writeState('source-status.json', status, true);
  persistHttpState(rt);
  store.pruneRaw(today, config.rawRetentionDays);
  log.info('corpus updated', {
    ...stats,
    pruned,
    saved: kept.length,
    partitionsWritten: saved.written,
    partitionsRemoved: saved.removed,
  });
  return { reports, merge: stats, pruned };
}
