import { CANDLE_INTERVALS, type CandleInterval } from '@trading-bolt/shared';

const INTERVAL_MS: Record<CandleInterval, number> = {
  '1m': 60_000,
  '5m': 300_000,
  '15m': 900_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

/**
 * Millisecond duration of a candle interval, used to schedule the next bot
 * cycle tick. Unknown intervals are a programming error (DTO validation runs
 * first), so they fail loudly rather than spinning a wasted loop.
 */
export function intervalToMs(interval: string): number {
  const ms = INTERVAL_MS[interval as CandleInterval];
  if (ms === undefined) {
    throw new Error(
      `Unknown candle interval "${interval}". Supported: ${CANDLE_INTERVALS.join(', ')}`,
    );
  }
  return ms;
}
