import { BrokerError } from "../errors.js";
import type { Money } from "@trading-bolt/shared";

/**
 * Binance spot API domain types (AGENTS.md §12). This module is the ONLY place
 * that knows the Binance wire format; the rest of Trading Bolt sees the
 * `BrokerAdapter` abstraction. Development targets Binance Testnet
 * (`testnet.binance.vision`); production is refused by the API env validation
 * unless NODE_ENV=production (fail-closed).
 */

export type BinanceEnvironment = "testnet" | "mainnet";

/** Separate the risk of accidentally targeting live: default is testnet. */
export const BINANCE_ENVIRONMENTS: readonly BinanceEnvironment[] = ["testnet", "mainnet"];

export function isBinanceEnvironment(value: string): value is BinanceEnvironment {
  return (BINANCE_ENVIRONMENTS as readonly string[]).includes(value);
}

export const BINANCE_BASE_URLS: Record<BinanceEnvironment, string> = {
  testnet: "https://testnet.binance.vision",
  mainnet: "https://api.binance.com",
};

/** Minimal fetch surface used for transport (mirrors the Bybit adapter's). */
export interface FetchLikeResponse {
  ok: boolean;
  status: number;
  statusText: string;
  json(): Promise<unknown>;
}

export interface FetchLike {
  (
    url: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
    },
  ): Promise<FetchLikeResponse>;
}

export interface BinanceAdapterConfig {
  apiKey: string;
  apiSecret: string;
  environment?: BinanceEnvironment;
  /** Override the base URL (test isolation). */
  baseUrl?: string;
  /** Injectable fetch implementation (defaults to the global fetch). */
  fetchImpl?: FetchLike;
  /** API receive window in ms (default 5000). */
  recvWindow?: number;
  /** Injectable clock (epoch ms) so signatures are deterministic in tests. */
  now?: () => number;
}

/** Instrument filters for quantity/price normalization (per symbol). */
export interface BinanceInstrumentFilter {
  symbol: string;
  /** Minimum quantity increment (LOT_SIZE.stepSize). */
  qtyStep: Money;
  /** Minimum price increment (PRICE_FILTER.tickSize). */
  tickSize: Money;
}

/**
 * Spot filter defaults for the symbols Trading Bolt supports. These mirror the
 * current Binance spot LOT_SIZE / PRICE_FILTER for each pair and should be
 * confirmed against the testnet exchangeInfo when real credentials are used.
 */
export const BINANCE_INSTRUMENT_FILTERS: Record<string, BinanceInstrumentFilter> = {
  BTCUSDT: { symbol: "BTCUSDT", qtyStep: "0.00001", tickSize: "0.01" },
  ETHUSDT: { symbol: "ETHUSDT", qtyStep: "0.0001", tickSize: "0.01" },
  SOLUSDT: { symbol: "SOLUSDT", qtyStep: "0.01", tickSize: "0.01" },
};

/** Base asset per supported spot symbol (positions are derived from balances). */
export const BINANCE_BASE_ASSET: Record<string, string> = {
  BTCUSDT: "BTC",
  ETHUSDT: "ETH",
  SOLUSDT: "SOL",
};

/**
 * Error carrying the Binance API code so adapters can branch without parsing
 * free-form messages (e.g. -2013 = order does not exist).
 */
export class BinanceApiError extends BrokerError {
  constructor(
    readonly code: number,
    message: string,
  ) {
    super(`Binance error ${code}: ${message}`);
    this.name = "BinanceApiError";
  }
}

export interface BinanceErrorBody {
  code?: number;
  msg?: string;
}

export type BinanceOrderSide = "BUY" | "SELL";
export type BinanceOrderType = "MARKET" | "LIMIT";
export type BinanceTimeInForce = "GTC" | "IOC" | "FOK" | "GTX";

export type BinanceOrderStatus =
  "NEW" | "PARTIALLY_FILLED" | "FILLED" | "CANCELED" | "REJECTED" | "EXPIRED" | "PENDING_CANCEL";

/** POST /api/v3/order response. */
export interface BinanceOrderResponse {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  transactTime: number;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: BinanceOrderStatus;
  timeInForce: BinanceTimeInForce;
  type: BinanceOrderType;
  side: BinanceOrderSide;
}

/** GET /api/v3/order, DELETE /api/v3/order, GET /api/v3/openOrders shape. */
export interface BinanceOrderQuery {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: BinanceOrderStatus;
  timeInForce: BinanceTimeInForce;
  type: BinanceOrderType;
  side: BinanceOrderSide;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  origQuoteOrderQty: string;
}

/** GET /api/v3/account response. */
export interface BinanceAccountItem {
  asset: string;
  free: string;
  locked: string;
}

export interface BinanceAccountInfo {
  balances: BinanceAccountItem[];
}

/** POST /api/v3/order/oco response (protective bracket, AGENTS.md §14/§45). */
export interface BinanceOcoOrderReport {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: BinanceOrderStatus;
  timeInForce: BinanceTimeInForce;
  type: string;
  side: BinanceOrderSide;
  stopPrice: string;
}

export interface BinanceOcoResponse {
  orderListId: number;
  contingencyType: string;
  listStatusType: string;
  listOrderStatus: string;
  listClientOrderId: string;
  transactionTime: number;
  symbol: string;
  orders: Array<{ symbol: string; orderId: number; clientOrderId: string }>;
  orderReports: BinanceOcoOrderReport[];
}
