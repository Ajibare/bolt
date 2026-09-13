import type { SupportedSymbol } from '@trading-bolt/shared';
import type {
  Candle,
  CandleInterval,
  OrderBook,
  Ticker,
  TradeTick,
} from '@trading-bolt/shared';

export interface GetCandlesOptions {
  interval: CandleInterval;
  limit: number;
}

/**
 * Broker/model-agnostic market data source. Providers (e.g. Bybit) implement
 * this; consumers depend only on the abstraction.
 */
export abstract class MarketDataProvider {
  abstract readonly name: string;
  abstract getSymbols(): SupportedSymbol[];
  abstract getCandles(
    symbol: SupportedSymbol,
    options: GetCandlesOptions,
  ): Promise<Candle[]>;
  abstract getTicker(symbol: SupportedSymbol): Promise<Ticker | null>;
  abstract getRecentTrades(
    symbol: SupportedSymbol,
    limit: number,
  ): Promise<TradeTick[]>;
  abstract getOrderBook(
    symbol: SupportedSymbol,
    limit: number,
  ): Promise<OrderBook>;
}
