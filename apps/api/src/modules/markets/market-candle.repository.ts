import type { MarketCandleEntity } from './market-candle.entity.js';

/**
 * Persistence port for OHLCV candles. Keeps TypeORM details out of the
 * service so the cache-aside logic can be tested with a mock without a
 * running database, matching the MarketDataProvider pattern.
 */
export abstract class MarketCandleRepository {
  abstract findLatest(
    symbol: string,
    interval: string,
    limit: number,
  ): Promise<MarketCandleEntity[]>;

  abstract upsertCandles(
    rows: ReadonlyArray<Partial<MarketCandleEntity>>,
  ): Promise<void>;
}
