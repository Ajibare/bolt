import type {
  Candle,
  CandleInterval,
  SupportedSymbol,
} from '@trading-bolt/shared';
import type { MarketCandleEntity } from './market-candle.entity.js';

export function candleToEntity(
  candle: Candle,
  symbol: SupportedSymbol,
  interval: CandleInterval,
): Partial<MarketCandleEntity> {
  return {
    symbol,
    interval,
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export function entityToCandle(entity: MarketCandleEntity): Candle {
  return {
    symbol: entity.symbol as SupportedSymbol,
    interval: entity.interval,
    timestamp: entity.timestamp,
    open: entity.open,
    high: entity.high,
    low: entity.low,
    close: entity.close,
    volume: entity.volume,
  };
}
