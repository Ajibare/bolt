import { BadRequestException, Injectable } from '@nestjs/common';
import type { SupportedSymbol } from '@trading-bolt/shared';
import {
  CANDLE_INTERVALS,
  isCandleInterval,
  isSupportedSymbol,
} from '@trading-bolt/shared';
import type { Candle, CandleInterval, Ticker } from '@trading-bolt/shared';
import { isCandleDataFresh } from './candle-intervals.js';
import { MARKET_DATA_MAX_LIMIT, MARKET_DATA_DEFAULT_LIMIT } from './limits.js';
import { entityToCandle, candleToEntity } from './market-candle.mapper.js';
import { MarketCandleRepository } from './market-candle.repository.js';
import { MarketDataProvider } from './market-data.provider.js';

@Injectable()
export class MarketsService {
  constructor(
    private readonly provider: MarketDataProvider,
    private readonly candleRepository: MarketCandleRepository,
  ) {}

  getSymbols(): SupportedSymbol[] {
    return this.provider.getSymbols();
  }

  /**
   * Cache-aside reads: serve stored candles when the latest stored timestamp
   * is fresh; otherwise fetch from the provider, persist (idempotent upsert),
   * and serve from the store. Provider results are used only as a fallback
   * when the store cannot be re-read.
   */
  async getCandles(
    symbol: string,
    interval: string,
    limit?: number,
  ): Promise<Candle[]> {
    const resolvedSymbol = this.resolveSymbol(symbol);
    const resolvedInterval = this.resolveInterval(interval);
    const resolvedLimit = this.resolveLimit(limit);

    const stored = await this.candleRepository.findLatest(
      resolvedSymbol,
      resolvedInterval,
      resolvedLimit,
    );

    const latest = stored[0];
    if (
      latest &&
      isCandleDataFresh(latest.timestamp, resolvedInterval, Date.now())
    ) {
      return stored.map(entityToCandle);
    }

    const fetched = await this.provider.getCandles(resolvedSymbol, {
      interval: resolvedInterval,
      limit: resolvedLimit,
    });

    await this.candleRepository.upsertCandles(
      fetched.map((candle) =>
        candleToEntity(candle, resolvedSymbol, resolvedInterval),
      ),
    );

    const persisted = await this.candleRepository.findLatest(
      resolvedSymbol,
      resolvedInterval,
      resolvedLimit,
    );
    if (persisted.length > 0) {
      return persisted.map(entityToCandle);
    }
    return fetched;
  }

  async getTicker(symbol: string): Promise<Ticker | null> {
    return this.provider.getTicker(this.resolveSymbol(symbol));
  }

  private resolveSymbol(symbol: string): SupportedSymbol {
    const normalized = symbol.trim().toUpperCase();
    if (!isSupportedSymbol(normalized)) {
      throw new BadRequestException(
        `Unsupported symbol "${symbol}". Supported: ${this.provider
          .getSymbols()
          .join(', ')}`,
      );
    }
    return normalized;
  }

  private resolveInterval(interval: string): CandleInterval {
    if (!isCandleInterval(interval)) {
      throw new BadRequestException(
        `Unsupported interval "${interval}". Supported: ${CANDLE_INTERVALS.join(', ')}`,
      );
    }
    return interval;
  }

  private resolveLimit(limit?: number): number {
    const value = limit ?? MARKET_DATA_DEFAULT_LIMIT;
    return Math.min(Math.max(Math.trunc(value), 1), MARKET_DATA_MAX_LIMIT);
  }
}
