import type { Money } from "@trading-bolt/shared";
import type { BrokerOrderStatus, BrokerSide, BrokerOrderType } from "../broker.interface.js";

/**
 * Paper broker domain types. The snapshot is a pure data structure consumed
 * by the execution engine; the broker implementation mutates it transactionally
 * after each decision.
 */

export interface PaperOrderState {
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
  feeRate?: Money;
  slippage?: Money;
  status: BrokerOrderStatus;
  filledQuantity: Money;
  avgFillPrice: Money | null;
  fees: Money;
  createdAt: number;
  updatedAt: number;
  /** Set when status != FILLED and the order should be derivable. */
  reason?: string;
}

export interface HeldQuantity {
  symbol: string;
  quantity: Money;
  avgEntryPrice: Money;
}

export interface PaperBrokerSnapshot {
  freeCash: Money;
  heldQuantity: HeldQuantity | null;
}

/** A single market price observation (e.g. from the Markets service). */
export interface MonetaryOracle {
  symbol: string;
  price: Money;
  timestamp: number;
}

export interface PaperBrokerConfig {
  /** Starting cash, decimal string. */
  startingCash: Money;
  /** Default fee rate applied to fills (decimal fraction). */
  feeRate?: Money;
  /** Default slippage fraction applied to market fills. */
  slippage?: Money;
  /**
   * Restore the free-cash balance exactly (instead of computing it from
   * `startingCash` and trade history). Used to rehydrate a broker from the
   * database so Postgres remains the source of truth (AGENTS.md §13).
   */
  initialFreeCash?: Money;
  /**
   * Restore existing holdings directly (instead of an empty book). Each entry
   * becomes a position with the given quantity, average entry and fees paid.
   */
  initialPositions?: ReadonlyArray<{
    symbol: string;
    quantity: Money;
    avgEntryPrice: Money;
    fees: Money;
  }>;
}
