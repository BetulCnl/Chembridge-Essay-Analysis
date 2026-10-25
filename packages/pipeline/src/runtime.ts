import type { PipelineConfig, RuntimeEnv } from './config.ts';
import { loadConfig, loadRuntimeEnv, userAgent } from './config.ts';
import { ConditionalCache } from './http/conditionalCache.ts';
import { HttpClient, type FetchFn } from './http/client.ts';
import type { Sleep } from './http/rateLimiter.ts';
import { createLogger, type Logger } from './log.ts';
import { DataStore, todayUtc } from './store.ts';

/** Everything a pipeline stage needs, built once per CLI invocation. */
export interface Runtime {
  config: PipelineConfig;
  env: RuntimeEnv;
  store: DataStore;
  http: HttpClient;
  log: Logger;
  now: Date;
  saveRaw: boolean;
}

export interface RuntimeOptions {
  dataDir?: string;
  now?: Date;
  fetchFn?: FetchFn;
  /** Injected in tests so rate-limit waits do not slow them down. */
  sleep?: Sleep;
  saveRaw?: boolean;
  config?: PipelineConfig;
  log?: Logger;
}

export function createRuntime(opts: RuntimeOptions = {}): Runtime {
  const config = opts.config ?? loadConfig();
  const env = loadRuntimeEnv(opts.dataDir ? { dataDir: opts.dataDir } : {});
  const store = new DataStore(env.dataDir);
  const log = opts.log ?? createLogger();
  const now = opts.now ?? new Date();
  const saveRaw = opts.saveRaw ?? true;
  const day = todayUtc(now);
  const http = new HttpClient({
    userAgent: userAgent(env),
    cache: new ConditionalCache(store.path('http-cache.json')),
    robotsCachePath: store.path('robots-cache.json'),
    log: log.child('http'),
    ...(opts.fetchFn ? { fetchFn: opts.fetchFn } : {}),
    ...(opts.sleep ? { sleep: opts.sleep } : {}),
    onResponse: saveRaw
      ? (source, res) => {
          if (source === 'robots') return;
          store.saveRaw(day, source, res.url, res.status, res.text);
        }
      : undefined,
  });
  if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY && !opts.fetchFn) {
    log.warn('HTTPS_PROXY is set but NODE_USE_ENV_PROXY is not; Node fetch will ignore the proxy');
  }
  return { config, env, store, http, log, now, saveRaw };
}

export function persistHttpState(rt: Runtime): void {
  rt.http.cache.save();
  rt.http.robots.save();
}
