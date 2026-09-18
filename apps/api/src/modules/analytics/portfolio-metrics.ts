import { div, round, sub, toDecimal } from '@trading-bolt/shared';
import type { PaperPortfolioSnapshotEntity } from '../paper-trading/entities/paper-trading.entity.js';

/** Fraction precision for return / drawdown ratios (0.05 = 5%). */
const RATIO_PRECISION = 8;

/** Structural view of the snapshot fields the metrics read. */
export type PortfolioSnapshotLike = Pick<
  PaperPortfolioSnapshotEntity,
  'createdAt' | 'equity'
>;

export interface EquityCurvePoint {
  /** Epoch milliseconds of the snapshot. */
  timestamp: number;
  equity: string;
}

export interface PortfolioMetrics {
  /** Equity at the start of the reported window. */
  startEquity: string;
  /** Equity at the end of the window (latest snapshot). */
  endEquity: string;
  /** Highest equity reached across the window. */
  peakEquity: string;
  /** `(end - start) / start` as a decimal fraction (may be negative). */
  totalReturn: string;
  /**
   * Most negative `(equity - peak) / peak` across the window, as a decimal
   * fraction (0 when equity never fell below its running peak).
   */
  maxDrawdown: string;
}

function ratio(value: ReturnType<typeof toDecimal>): string {
  return round(value, RATIO_PRECISION).toFixed(RATIO_PRECISION);
}

/**
 * The immutable equity curve in ascending time order. Snapshots are already
 * ordered by the repository; an explicit sort makes the computation
 * deterministic regardless of storage order.
 */
export function equityCurve(
  snapshots: PortfolioSnapshotLike[],
): EquityCurvePoint[] {
  return snapshots
    .slice()
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((snapshot) => ({
      timestamp: snapshot.createdAt.getTime(),
      equity: snapshot.equity,
    }));
}

/**
 * Deterministic portfolio metrics computed from the equity curve using
 * decimal arithmetic (AGENTS.md §14). A window with no snapshots reports the
 * flat `fallbackEquity` window so the caller can substitute account state.
 */
export function metricsFromCurve(
  curve: EquityCurvePoint[],
  fallbackEquity: string,
): PortfolioMetrics {
  if (curve.length === 0) {
    return {
      startEquity: fallbackEquity,
      endEquity: fallbackEquity,
      peakEquity: fallbackEquity,
      totalReturn: ratio(toDecimal(0)),
      maxDrawdown: ratio(toDecimal(0)),
    };
  }

  let peak = toDecimal(curve[0].equity);
  let maxDrawdown = toDecimal(0);

  for (const point of curve) {
    const value = toDecimal(point.equity);
    if (value.greaterThan(peak)) {
      peak = value;
    }
    if (!peak.isZero()) {
      const drawdown = div(sub(value, peak), peak);
      if (drawdown.lessThan(maxDrawdown)) {
        maxDrawdown = drawdown;
      }
    }
  }

  const start = toDecimal(curve[0].equity);
  const end = toDecimal(curve[curve.length - 1].equity);
  const totalReturn = start.isZero()
    ? toDecimal(0)
    : div(sub(end, start), start);

  return {
    startEquity: curve[0].equity,
    endEquity: curve[curve.length - 1].equity,
    peakEquity: peak.toString(),
    totalReturn: ratio(totalReturn),
    maxDrawdown: ratio(maxDrawdown),
  };
}
