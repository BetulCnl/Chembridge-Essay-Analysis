#!/usr/bin/env node
/**
 * ChemBridge pipeline CLI.
 *
 *   pnpm pipeline collect [--sources=arxiv,chemrxiv] [--days=N]
 *   pnpm pipeline analyze
 *   pnpm pipeline publish [--out=<dir>]
 *   pnpm pipeline run [--skip-collect] # collect + analyze + publish (daily job)
 *   pnpm pipeline probe               # one live request per endpoint, prints a table
 *   pnpm pipeline fixtures:record     # probe and store trimmed responses as test fixtures
 *   pnpm pipeline stats               # corpus statistics
 *
 * Common flags: --data-dir=<dir> (default: $CHEMBRIDGE_DATA_DIR or ./.data), --no-raw
 */
import { createRuntime, type Runtime } from './runtime.ts';
import { collect } from './stages/collect.ts';
import { probe } from './stages/probe.ts';

type Args = Record<string, string | boolean>;

function parseArgs(argv: string[]): { command: string; args: Args } {
  const [command = 'help', ...rest] = argv;
  const args: Args = {};
  for (const a of rest) {
    const m = /^--([^=]+)(?:=(.*))?$/.exec(a);
    if (!m) continue;
    const key = m[1]!;
    if (key.startsWith('no-')) args[key.slice(3)] = false;
    else args[key] = m[2] ?? true;
  }
  return { command, args };
}

function list(v: string | boolean | undefined): string[] | undefined {
  return typeof v === 'string' && v ? v.split(',').map((s) => s.trim()) : undefined;
}

function num(v: string | boolean | undefined): number | undefined {
  if (typeof v !== 'string') return undefined;
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`expected a number, got "${v}"`);
  return n;
}

async function lazy<T>(load: () => Promise<T>): Promise<T> {
  return load();
}

const COMMANDS: Record<string, (rt: Runtime, args: Args) => Promise<number>> = {
  async collect(rt, args) {
    const sources = list(args.sources);
    const days = num(args.days);
    const r = await collect(rt, {
      ...(sources ? { sources } : {}),
      ...(days !== undefined ? { days } : {}),
    });
    return r.reports.every((x) => x.ok) ? 0 : 2;
  },
  async analyze(rt) {
    const { analyze } = await lazy(() => import('./stages/analyze.ts'));
    await analyze(rt);
    return 0;
  },
  async publish(rt, args) {
    const { publish } = await lazy(() => import('./stages/publish.ts'));
    await publish(rt, typeof args.out === 'string' ? { outDir: args.out } : {});
    return 0;
  },
  async run(rt, args) {
    const sources = list(args.sources);
    const days = num(args.days);
    const r = args['skip-collect']
      ? { reports: [] }
      : await collect(rt, {
          ...(sources ? { sources } : {}),
          ...(days !== undefined ? { days } : {}),
        });
    const { analyze } = await import('./stages/analyze.ts');
    const { publish } = await import('./stages/publish.ts');
    await analyze(rt);
    await publish(rt, typeof args.out === 'string' ? { outDir: args.out } : {});
    const failed = r.reports.filter((x) => !x.ok).map((x) => x.source);
    if (failed.length)
      rt.log.warn('some sources failed; published with the data that was collected', { failed });
    // Partial failures are reported in meta.json; only a total failure fails the job.
    return failed.length === r.reports.length && r.reports.length > 0 ? 2 : 0;
  },
  async probe(rt) {
    const rows = await probe(rt);
    console.table(rows);
    return 0;
  },
  async 'fixtures:record'(rt) {
    const rows = await probe(rt, { recordFixtures: true });
    console.table(rows);
    return 0;
  },
  async stats(rt) {
    const corpus = rt.store.loadCorpus();
    const bySource = new Map<string, number>();
    for (const d of corpus)
      for (const s of new Set(d.sources.map((x) => x.source)))
        bySource.set(s, (bySource.get(s) ?? 0) + 1);
    const multi = corpus.filter((d) => new Set(d.sources.map((s) => s.source)).size > 1).length;
    console.log(`corpus: ${corpus.length} developments (${multi} seen in more than one source)`);
    console.table(Object.fromEntries([...bySource].sort((a, b) => b[1] - a[1])));
    return 0;
  },
};

async function main(): Promise<void> {
  const { command, args } = parseArgs(process.argv.slice(2));
  const handler = COMMANDS[command];
  if (!handler) {
    console.log(
      `usage: pnpm pipeline <${Object.keys(COMMANDS).join('|')}> [--data-dir=DIR] [--sources=a,b] [--days=N]`,
    );
    process.exitCode = command === 'help' ? 0 : 1;
    return;
  }
  const rt = createRuntime({
    ...(typeof args['data-dir'] === 'string' ? { dataDir: args['data-dir'] } : {}),
    saveRaw: args.raw !== false && command !== 'probe' && command !== 'fixtures:record',
  });
  process.exitCode = await handler(rt, args);
}

main().catch((err) => {
  console.error(err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
