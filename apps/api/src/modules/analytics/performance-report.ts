import { div, round, sub, toDecimal } from '@trading-bolt/shared';

import type { EquityCurvePoint } from './portfolio-metrics.js';

/** Fraction precision for per-period returns (0.05 = 5%). */
const RATIO_PRECISION = 8;
const MONEY_PRECISION = 8;
const DAY_MS = 86_400_000;

export type PeriodGranularity = 'day' | 'week' | 'month';

export interface PeriodReturn {
  granularity: PeriodGranularity;
  /** UTC label of the period start (`yyyy-mm-dd`, or `yyyy-mm` for months). */
  label: string;
  /** Epoch ms of the period start (UTC). */
  startTime: number;
  /** Epoch ms of the period end (exclusive). */
  endTime: number;
  /**
   * Equity at the period start: the previous period's end, or the first
   * observed point for the opening period. Never fabricated from gaps.
   */
  startingEquity: string;
  /** Equity of the last snapshot observed inside the period. */
  endingEquity: string;
  /** `(ending - starting) / starting` as a decimal fraction; null when the
   * starting equity is zero (the ratio is undefined, never a fake number). */
  returnPercent: string | null;
  /** `ending - starting`. */
  pnl: string;
  /** Number of snapshots observed inside the period. */
  snapshots: number;
}

function ratio(value: ReturnType<typeof toDecimal>): string {
  return round(value, RATIO_PRECISION).toFixed(RATIO_PRECISION);
}

function money(value: ReturnType<typeof toDecimal>): string {
  return round(value, MONEY_PRECISION).toFixed(MONEY_PRECISION);
}

/** UTC midnight that starts the local UTC day containing `timestamp`. */
function startOfUtcDay(timestamp: number): number {
  const d = new Date(timestamp);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/** UTC period-boundary start containing `timestamp` (weeks start Monday). */
function periodStart(
  timestamp: number,
  granularity: PeriodGranularity,
): number {
  const dayStart = startOfUtcDay(timestamp);
  if (granularity === 'day') {
    return dayStart;
  }
  if (granularity === 'week') {
    const weekday = (new Date(timestamp).getUTCDay() + 6) % 7; // Monday = 0
    return dayStart - weekday * DAY_MS;
  }
  return Date.UTC(
    new Date(timestamp).getUTCFullYear(),
    new Date(timestamp).getUTCMonth(),
    1,
  );
}

function nextPeriodStart(
  startTime: number,
  granularity: PeriodGranularity,
): number {
  if (granularity === 'day') {
    return startTime + DAY_MS;
  }
  if (granularity === 'week') {
    return startTime + 7 * DAY_MS;
  }
  const d = new Date(startTime);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}

function labelFor(startTime: number, granularity: PeriodGranularity): string {
  if (granularity === 'month') {
    const d = new Date(startTime);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  }
  return new Date(startTime).toISOString().slice(0, 10);
}

/**
 * Splits the equity curve into calendar periods (UTC day / Monday-based week /
 * month) and computes each period's return. Periods without snapshots are
 * skipped — the next period chains from the last observed equity, so nothing
 * is ever fabricated (AGENTS.md §27). All math is deterministic decimal.
 *
 * The opening period's starting equity is the first observed point (there is
 * no earlier data to measure against).
 */
export function periodReturns(
  curve: EquityCurvePoint[],
  granularity: PeriodGranularity,
): PeriodReturn[] {
  const buckets = new Map<number, EquityCurvePoint[]>();

  for (const point of curve) {
    const start = periodStart(point.timestamp, granularity);
    const list = buckets.get(start) ?? [];
    list.push(point);
    buckets.set(start, list);
  }

  const starts = [...buckets.keys()].sort((a, b) => a - b);
  const out: PeriodReturn[] = [];
  let previousEnd: ReturnType<typeof toDecimal> | null = null;

  for (const start of starts) {
    const points = buckets.get(start) as EquityCurvePoint[];
    const startingEquity = previousEnd ?? toDecimal(points[0].equity);
    const endingEquity = toDecimal(points[points.length - 1].equity);
    const delta = sub(endingEquity, startingEquity);

    out.push({
      granularity,
      label: labelFor(start, granularity),
      startTime: start,
      endTime: nextPeriodStart(start, granularity),
      startingEquity: startingEquity.toString(),
      endingEquity: endingEquity.toString(),
      returnPercent: startingEquity.isZero()
        ? null
        : ratio(div(delta, startingEquity)),
      pnl: money(delta),
      snapshots: points.length,
    });

    previousEnd = endingEquity;
  }

  return out;
}
