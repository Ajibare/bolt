import type { Money } from "@trading-bolt/shared";

/**
 * Bybit v5 unified-trading-adapter domain types (AGENTS.md §12). This module
 * is the ONLY place that knows the v5 wire format; the rest of Trading Bolt
 * sees the `BrokerAdapter` abstraction.
 */

export type BybitEnvironment = "demo" | "testnet" | "mainnet";

/** Separate the risk of accidentally targeting live: default is demo. */
export const BYBIT_ENVIRONMENTS: readonly BybitEnvironment[] = ["demo", "testnet", "mainnet"];

export function isBybitEnvironment(value: string): value is BybitEnvironment {
  return (BYBIT_ENVIRONMENTS as readonly string[]).includes(value);
}

export const BYBIT_BASE_URLS: Record<BybitEnvironment, string> = {
  demo: "https://api-demo.bybit.com",
  testnet: "https://api-testnet.bybit.com",
  mainnet: "https://api.bybit.com",
};

/** Minimal fetch surface used for transport (avoids a runtime dependency and
 * keeps DOM libs out of this package's compilation). Structurally compatible
 * with Node's global fetch. */
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

export interface BybitAdapterConfig {
  apiKey: string;
  apiSecret: string;
  environment?: BybitEnvironment;
  /** Override the base URL (test isolation). */
  baseUrl?: string;
  /** Injectable fetch implementation (defaults to the global fetch). */
  fetchImpl?: FetchLike;
  /** API receive window in ms (default 5000). */
  recvWindow?: number;
}

/** Instrument filters for quantity/price normalization (per symbol). */
export interface BybitInstrumentFilter {
  symbol: string;
  /** Minimum quantity increment. */
  qtyStep: Money;
  /** Minimum price increment. */
  tickSize: Money;
}

/**
 * Demo/testnet default filters for the symbols Trading Bolt supports. These
 * are used to normalize quantities/prices before submission; they should be
 * confirmed against the demo environment's instrument info when real
 * credentials are available.
 */
export const BYBIT_INSTRUMENT_FILTERS: Record<string, BybitInstrumentFilter> = {
  BTCUSDT: { symbol: "BTCUSDT", qtyStep: "0.001", tickSize: "0.10" },
  ETHUSDT: { symbol: "ETHUSDT", qtyStep: "0.001", tickSize: "0.05" },
  SOLUSDT: { symbol: "SOLUSDT", qtyStep: "0.1", tickSize: "0.01" },
};

export interface BybitApiResponse<Result> {
  retCode: number;
  retMsg: string;
  result: Result;
  time: number;
}

export type BybitOrderSide = "Buy" | "Sell";
export type BybitOrderType = "Market" | "Limit";
export type BybitTimeInForce = "Ioc" | "Gtc" | "Fok" | "PostOnly";
export type BybitPositionIdx = 0 | 1 | 2;

export type BybitOrderStatus =
  | "Created"
  | "New"
  | "PartiallyFilled"
  | "PartiallyFilledCanceled"
  | "Filled"
  | "Canceled"
  | "Untriggered"
  | "Triggered"
  | "Rejected"
  | "Deactivated"
  | "PendingCancel";

export interface BybitCreatedOrder {
  orderId: string;
  orderLinkId: string;
}

export interface BybitOrderItem {
  orderId: string;
  orderLinkId: string;
  symbol: string;
  side: BybitOrderSide;
  orderType: BybitOrderType;
  orderStatus: BybitOrderStatus;
  qty: string;
  price: string;
  cumExecQty: string;
  avgPrice: string;
  stopLoss: string;
  takeProfit: string;
  reduceOnly: boolean;
  rejectReason: string;
  timeInForce: BybitTimeInForce;
  createdTime: string;
  updatedTime: string;
}

export interface BybitOrderListResult {
  list?: BybitOrderItem[];
  nextPageCursor?: string;
  category?: string;
}

export interface BybitPositionItem {
  symbol: string;
  side: BybitOrderSide;
  size: string;
  avgPrice: string;
  positionStatus: string;
  unrealisedPnl: string;
  realisedPnl: string;
  stopLoss: string;
  takeProfit: string;
  positionIdx: number;
}

export interface BybitPositionListResult {
  list?: BybitPositionItem[];
  nextPageCursor?: string;
  category?: string;
}

export interface BybitCoinBalance {
  coin: string;
  walletBalance: string;
  availableToWithdraw: string;
  equity: string;
  locked: string;
}

export interface BybitWalletResult {
  list?: Array<{
    totalEquity: string;
    totalWalletBalance: string;
    totalAvailableBalance: string;
    coin?: BybitCoinBalance[];
  }>;
}
