/**
 * Trend analysis over the chemistry × CS matrix: weekly and monthly counts, growth of the
 * last N weeks versus the N weeks before, and "quiet but promising" cells (few items, high
 * average suitability score).
 */
import type { Cell, CellStat, Trends } from './schema.ts';

export interface TrendItem {
  id: string;
  date: string;
  score: number;
  cells: Cell[];
  chem: string[];
  cs: string[];
}

export interface TrendOptions {
  now: Date;
  weeks?: number;
  months?: number;
  recentWeeks?: number;
  minRising?: number;
  risingGrowth?: number;
  minQuiet?: number;
}

/** ISO-8601 week key, e.g. 2026-W43. */
export function isoWeek(date: string | Date): string {
  const d =
    typeof date === 'string'
      ? new Date(`${date}T00:00:00Z`)
      : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Monday..Sunday (YYYY-MM-DD) of an ISO week key. */
export function weekRange(week: string): { from: string; to: string } {
  const [y, w] = week.split('-W').map(Number) as [number, number];
  const jan4 = new Date(Date.UTC(y, 0, 4));
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1) + (w - 1) * 7);
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return { from: monday.toISOString().slice(0, 10), to: sunday.toISOString().slice(0, 10) };
}

export function lastWeeks(now: Date, n: number): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d);
    x.setUTCDate(d.getUTCDate() - i * 7);
    out.push(isoWeek(x));
  }
  return [...new Set(out)];
}

export function lastMonths(now: Date, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

export function computeTrends(items: TrendItem[], opts: TrendOptions): Omit<Trends, 'clusters'> {
  const weeks = lastWeeks(opts.now, opts.weeks ?? 26);
  const months = lastMonths(opts.now, opts.months ?? 6);
  const recentN = opts.recentWeeks ?? 4;
  const weekIndex = new Map(weeks.map((w, i) => [w, i]));
  const monthIndex = new Map(months.map((m, i) => [m, i]));

  interface Acc {
    chem: string;
    cs: string;
    weekly: number[];
    existing: number;
    inferred: number;
    scores: Array<{ id: string; score: number }>;
  }
  const cells = new Map<string, Acc>();
  const chemTotals: Record<string, number[]> = {};
  const csTotals: Record<string, number[]> = {};
  const monthly: Record<string, number[]> = { all: months.map(() => 0) };
  const bump = (rec: Record<string, number[]>, key: string, len: number, i: number) => {
    (rec[key] ??= Array.from({ length: len }, () => 0))[i]! += 1;
  };

  for (const it of items) {
    const wi = weekIndex.get(isoWeek(it.date));
    const mi = monthIndex.get(it.date.slice(0, 7));
    if (mi !== undefined) {
      monthly.all![mi]! += 1;
      for (const c of new Set(it.chem)) bump(monthly, `chem:${c}`, months.length, mi);
      for (const c of new Set(it.cs)) bump(monthly, `cs:${c}`, months.length, mi);
    }
    if (wi !== undefined) {
      for (const c of new Set(it.chem)) bump(chemTotals, c, weeks.length, wi);
      for (const c of new Set(it.cs)) bump(csTotals, c, weeks.length, wi);
    }
    for (const cell of it.cells) {
      const key = `${cell.chem}|${cell.cs}`;
      let acc = cells.get(key);
      if (!acc)
        cells.set(
          key,
          (acc = {
            chem: cell.chem,
            cs: cell.cs,
            weekly: weeks.map(() => 0),
            existing: 0,
            inferred: 0,
            scores: [],
          }),
        );
      if (cell.inferred) acc.inferred++;
      else acc.existing++;
      acc.scores.push({ id: it.id, score: it.score });
      if (wi !== undefined) acc.weekly[wi]! += 1;
    }
  }

  const stats: CellStat[] = [...cells.values()].map((a) => {
    const count = a.scores.length;
    const recent = a.weekly.slice(-recentN).reduce((x, y) => x + y, 0);
    const previous = a.weekly.slice(-2 * recentN, -recentN).reduce((x, y) => x + y, 0);
    const avg = a.scores.reduce((x, y) => x + y.score, 0) / Math.max(1, count);
    return {
      chem: a.chem,
      cs: a.cs,
      count,
      countExisting: a.existing,
      countInferred: a.inferred,
      avgScore: Math.round(avg * 10) / 10,
      maxScore: Math.max(0, ...a.scores.map((s) => s.score)),
      recent,
      previous,
      growth: Math.round(((recent + 1) / (previous + 1)) * 100) / 100,
      weekly: a.weekly,
      rising: false,
      quietPromising: false,
      topIds: [...a.scores]
        .sort((x, y) => y.score - x.score)
        .slice(0, 8)
        .map((s) => s.id),
    };
  });

  const minRising = opts.minRising ?? 5;
  const risingGrowth = opts.risingGrowth ?? 1.5;
  const minQuiet = opts.minQuiet ?? 3;
  const eligible = stats.filter((s) => s.count >= minQuiet);
  const countQ = quantile(
    eligible.map((s) => s.count),
    0.4,
  );
  const scoreQ = quantile(
    eligible.map((s) => s.avgScore),
    0.75,
  );
  for (const s of stats) {
    s.rising = s.recent >= minRising && s.growth >= risingGrowth;
    s.quietPromising = s.count >= minQuiet && s.count <= countQ && s.avgScore >= scoreQ;
  }
  stats.sort(
    (a, b) => b.count - a.count || a.chem.localeCompare(b.chem) || a.cs.localeCompare(b.cs),
  );

  return {
    generatedAt: opts.now.toISOString(),
    weeks,
    months,
    recentWeeks: recentN,
    cells: stats,
    chemTotals,
    csTotals,
    monthly,
  };
}
