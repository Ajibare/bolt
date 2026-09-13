/**
 * Minimal Bybit v5 response wrapper.
 * `result` is opaque and shaped differently per endpoint.
 */
export interface BybitApiResponse<Result = unknown> {
  retCode: number;
  retMsg: string;
  result: Result;
  time: number;
}

/** kline / candle response */
export interface BybitKlineResult {
  symbol: string;
  category: string;
  list: string[][];
}

/** tickers response (one element) */
export interface BybitTickerItem {
  symbol: string;
  lastPrice: string;
  highPrice24h: string;
  lowPrice24h: string;
  volume24h: string;
  ts?: string;
}

export interface BybitTickerResult {
  list: BybitTickerItem[];
}

/** recent trade response */
export interface BybitTradeItem {
  symbol: string;
  execId: string;
  price: string;
  size: string;
  side: string;
  time: string;
}

export interface BybitTradeResult {
  list: BybitTradeItem[];
}

/** order book response */
export interface BybitOrderBookResult {
  s: string;
  b: string[][];
  a: string[][];
  ts: number;
}
