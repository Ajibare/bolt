import type { SupportedSymbol } from "../constants/index.js";

/**
 * Market data domain types.
 *
 * Numeric fields are carried as decimal strings (never JavaScript floats):
 * exchanges already return prices as strings, so mapping them straight through
 * avoids any precision loss. Convert with `toDecimal` from the financial
 * helpers when arithmetic is required.
 */

export const CANDLE_INTERVALS = ["1m", "5m", "15m", "1h", "4h", "1d"] as const;
export type CandleInterval = (typeof CANDLE_INTERVALS)[number];

export function isCandleInterval(value: string): value is CandleInterval {
  return (CANDLE_INTERVALS as readonly string[]).includes(value);
}

export interface Candle {
  symbol: SupportedSymbol;
  interval: CandleInterval;
  /** Open time in epoch milliseconds. */
  timestamp: number;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

export interface Ticker {
  symbol: SupportedSymbol;
  /** Snapshot time in epoch milliseconds. */
  timestamp: number;
  lastPrice: string;
  high: string;
  low: string;
  volume: string;
}

export type TradeSide = "buy" | "sell";

export interface TradeTick {
  symbol: SupportedSymbol;
  /** Trade time in epoch milliseconds. */
  timestamp: number;
  tradeId: string;
  price: string;
  quantity: string;
  side: TradeSide;
}

export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface OrderBook {
  symbol: SupportedSymbol;
  /** Snapshot time in epoch milliseconds. */
  timestamp: number;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}
