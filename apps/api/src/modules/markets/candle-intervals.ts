import type { CandleInterval } from '@trading-bolt/shared';

const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

/**
 * A stored candle series is considered fresh when the latest (most recent)
 * timestamp is not older than twice the candle interval. This provides a
 * reasonable buffer for in-progress candles without hitting the provider on
 * every request.
 */
const FRESHNESS_MULTIPLIER = 2;

export function intervalToMs(interval: CandleInterval): number {
  return INTERVAL_MS[interval];
}

export function isCandleDataFresh(
  latestTimestamp: number,
  interval: CandleInterval,
  nowMs: number,
): boolean {
  return nowMs - latestTimestamp < INTERVAL_MS[interval] * FRESHNESS_MULTIPLIER;
}
