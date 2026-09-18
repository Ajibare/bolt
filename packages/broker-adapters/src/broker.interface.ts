import type { Money } from "@trading-bolt/shared";

/**
 * Broker abstraction shared by paper and live trading (AGENTS.md §11-12).
 *
 * The interface is intentionally execution-level: an adapter turns order
 * intents into broker-side states. All monetary fields are decimal strings.
 * Providers implement the same interface; nothing outside the adapter layer
 * knows about a specific exchange.
 */

export type BrokerSide = "buy" | "sell";
export type BrokerOrderType = "market" | "limit";

export const BROKER_ORDER_STATUSES = [
  "CREATED",
  "SUBMITTED",
  "ACCEPTED",
  "PARTIALLY_FILLED",
  "FILLED",
  "CANCELLED",
  "REJECTED",
  "FAILED",
] as const;

export type BrokerOrderStatus = (typeof BROKER_ORDER_STATUSES)[number];

export interface BrokerOrderRequest {
  side: BrokerSide;
  type: BrokerOrderType;
  symbol: string;
  /** Decimal string quantity. */
  quantity: Money;
  /** Decimal string limit price (required for limit orders). */
  price?: Money;
  /** Decimal string stop-loss price to attach to the resulting position. */
  stopLoss?: Money;
  /** Decimal string take-profit price to attach to the resulting position. */
  takeProfit?: Money;
  /** Reduce an existing position instead of opening/increasing it. */
  reduceOnly?: boolean;
  /** Caller-supplied idempotency key (unique per order). */
  clientOrderId: string;
}

export interface BrokerExecution {
  /** Decimal string average fill price, null when nothing filled. */
  avgFillPrice: Money | null;
  /** Decimal string cumulative filled quantity. */
  filledQuantity: Money;
  /** Decimal string fees paid on fills. */
  fees: Money;
  /** Broker-side status after the operation. */
  status: BrokerOrderStatus;
}

export interface BrokerOrder extends BrokerExecution {
  id: string;
  clientOrderId: string;
  side: BrokerSide;
  type: BrokerOrderType;
  symbol: string;
  quantity: Money;
  price?: Money;
  stopLoss?: Money;
  takeProfit?: Money;
  reduceOnly?: boolean;
  /** Rejection/failure explanation when status is REJECTED or FAILED. */
  reason?: string;
  /** Epoch-ms timestamps. */
  createdAt: number;
  updatedAt: number;
}

export interface BrokerPosition {
  symbol: string;
  /** Signed quantity: positive = long, negative = short. */
  quantity: Money;
  /** Decimal string average entry price. */
  avgEntryPrice: Money;
  stopLoss?: Money;
  takeProfit?: Money;
  /** Decimal string cumulative fees on this position. */
  fees: Money;
}

export interface BrokerAccountState {
  balances: Array<{
    asset: string;
    free: Money;
    used: Money;
    total: Money;
  }>;
}

export interface BrokerOrderIdentity {
  /** Broker-side symbol required by providers whose order APIs are keyed by
   * symbol + orderId (e.g. Binance spot). Providers without that requirement
   * ignore it. */
  symbol?: string;
}

/**
 * Protective bracket intent. Providers that attach SL/TP to the entry itself
 * (Bybit) never need this; providers that must place the bracket as a separate
 * order after the entry fills (Binance spot OCO) implement it.
 */
export interface ProtectiveBracketInput {
  /** Broker-side id of the FILLED entry order this bracket protects. */
  entryOrderId: string;
  symbol: string;
  /** Base-asset quantity the bracket guards (must be within the held lot). */
  quantity: Money;
  stopLoss: Money;
  takeProfit: Money;
  /**
   * Deterministic per-bracket key (unique per logical bracket) so a retry can
   * never create a second bracket (AGENTS.md §16).
   */
  idempotencyKey: string;
}

export interface ProtectiveBracket {
  /** Broker-side order-list identifier of the placed bracket. */
  bracketOrderListId: string;
  /** Epoch-ms timestamp of bracket creation. */
  createdAt: number;
}

export interface BrokerAdapter {
  placeOrder(request: BrokerOrderRequest): Promise<BrokerOrder>;
  cancelOrder(orderId: string, options?: BrokerOrderIdentity): Promise<void>;
  getOrder(orderId: string, options?: BrokerOrderIdentity): Promise<BrokerOrder | null>;
  getOpenOrders(symbol?: string): Promise<BrokerOrder[]>;
  getPositions(symbol?: string): Promise<BrokerPosition[]>;
  getAccountState(): Promise<BrokerAccountState>;
  /**
   * Places a protective stop-loss/take-profit bracket around an already-FILLED
   * entry (e.g. Binance spot OCO). Optional: providers that attach SL/TP at
   * entry time (Bybit) leave the base contract as-is.
   */
  attachProtectiveBracket?(input: ProtectiveBracketInput): Promise<ProtectiveBracket>;
}
