import type { SupportedSymbol } from '@trading-bolt/shared';
import type {
  Candle,
  CandleInterval,
  OrderBook,
  OrderBookLevel,
  Ticker,
  TradeSide,
  TradeTick,
} from '@trading-bolt/shared';
import { MarketDataError } from './http-client.js';
import type {
  BybitOrderBookResult,
  BybitTickerItem,
  BybitTradeItem,
} from './bybit.types.js';

/** Maps our CandleInterval codes to Bybit v5 kline interval strings. */
export const INTERVAL_BYBIT: Record<CandleInterval, string> = {
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '1h': '60',
  '4h': '240',
  '1d': 'D',
} as const;

function parseTimestamp(value: string, context: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new MarketDataError(
      'invalid_response',
      `Malformed timestamp in ${context}: ${JSON.stringify(value)}`,
    );
  }
  return n;
}

export function mapKlineRow(
  row: string[],
  symbol: SupportedSymbol,
  interval: CandleInterval,
): Candle {
  if (!Array.isArray(row) || row.length < 6) {
    throw new MarketDataError(
      'invalid_response',
      `Malformed kline row (expected ≥6 elements): ${JSON.stringify(row)}`,
    );
  }
  return {
    symbol,
    interval,
    timestamp: parseTimestamp(row[0], 'kline[0]'),
    open: String(row[1]),
    high: String(row[2]),
    low: String(row[3]),
    close: String(row[4]),
    volume: String(row[5]),
  };
}

/**
 * Maps a raw kline list from Bybit to sorted, deduplicated candles.
 * Bybit returns rows as strings, so numeric precision is preserved.
 */
export function mapKlineRows(
  rows: string[][],
  symbol: SupportedSymbol,
  interval: CandleInterval,
): Candle[] {
  const mapped = rows.map((row) => mapKlineRow(row, symbol, interval));

  // Sort ascending by timestamp (Bybit usually returns ascending already, but
  // we don't depend on that ordering).
  mapped.sort((a, b) => a.timestamp - b.timestamp);

  // De-duplicate: keep the last candle for each timestamp (latest data wins).
  const deduped: Candle[] = [];
  for (const candle of mapped) {
    const last = deduped[deduped.length - 1];
    if (last && last.timestamp === candle.timestamp) {
      deduped[deduped.length - 1] = candle;
    } else {
      deduped.push(candle);
    }
  }
  return deduped;
}

export function mapTicker(
  item: BybitTickerItem | undefined,
  symbol: SupportedSymbol,
  apiTimestamp: number,
): Ticker | null {
  if (!item) {
    return null;
  }
  return {
    symbol,
    timestamp: apiTimestamp,
    lastPrice: String(item.lastPrice),
    high: String(item.highPrice24h),
    low: String(item.lowPrice24h),
    volume: String(item.volume24h),
  };
}

const BYBIT_SIDE_MAP: Record<string, TradeSide> = {
  Buy: 'buy',
  Sell: 'sell',
};

export function mapTrade(
  item: BybitTradeItem,
  symbol: SupportedSymbol,
): TradeTick {
  const side = BYBIT_SIDE_MAP[item.side];
  if (!side) {
    throw new MarketDataError(
      'invalid_response',
      `Unexpected trade side "${item.side}" for ${symbol}`,
    );
  }
  return {
    symbol,
    timestamp: parseTimestamp(item.time, 'trade.time'),
    tradeId: String(item.execId),
    price: String(item.price),
    quantity: String(item.size),
    side,
  };
}

function mapLevels(raw: string[][]): OrderBookLevel[] {
  return raw.map((level) => {
    if (!Array.isArray(level) || level.length < 2) {
      throw new MarketDataError(
        'invalid_response',
        `Malformed orderbook level: ${JSON.stringify(level)}`,
      );
    }
    return { price: String(level[0]), quantity: String(level[1]) };
  });
}

export function mapOrderBook(
  raw: BybitOrderBookResult,
  symbol: SupportedSymbol,
): OrderBook {
  return {
    symbol,
    timestamp: parseTimestamp(String(raw.ts), 'orderbook.ts'),
    bids: mapLevels(raw.b),
    asks: mapLevels(raw.a),
  };
}
