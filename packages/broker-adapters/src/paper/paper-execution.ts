import { Decimal } from "decimal.js";
import type { MonetaryOracle, PaperBrokerSnapshot, PaperOrderState } from "./types.js";
import { InvalidOrderRequestError } from "../errors.js";

/**
 * Pure paper execution engine: given a broker snapshot and an oracle price,
 * decide the outcome of a single order deterministically. No I/O, no side
 * effects — the same inputs always produce the same fill.
 *
 * Order types:
 * - market: fills immediately at the oracle price (with slippage).
 * - limit: fills at the limit price when the market trades through it;
 *   otherwise rests as OPEN.
 */

export interface PaperFillResult {
  /** Broker status after this attempt. */
  status: "FILLED" | "PARTIALLY_FILLED" | "OPEN" | "REJECTED" | "FAILED";
  /** Price at which the order was (partially) filled, if any. */
  fillPrice?: string;
  /** Quantity filled in this attempt. */
  filledQuantity: string;
  /** Fee charged on this attempt. */
  fee: string;
  /** Reason for rejection/failure. */
  reason?: string;
}

export function evaluatePaperOrder(
  state: PaperBrokerSnapshot,
  order: PaperOrderState,
  oracle: MonetaryOracle,
): PaperFillResult {
  const rawPrice = oracle.symbol === order.symbol ? oracle.price : null;
  if (rawPrice === null || rawPrice === undefined) {
    return {
      status: "FAILED",
      filledQuantity: "0",
      fee: "0",
      reason: "No market price available",
    };
  }
  const price = new Decimal(rawPrice).toString();

  const side = order.side;
  const qty = new Decimal(order.quantity).toString();
  const feeRate = order.feeRate !== undefined ? new Decimal(order.feeRate).toString() : "0";
  const slippage = order.slippage !== undefined ? new Decimal(order.slippage).toString() : "0";

  if (side === "buy") {
    return evaluateBuy(state, order, price, qty, feeRate, slippage);
  }
  return evaluateSell(state, order, price, qty, feeRate);
}

function evaluateBuy(
  state: PaperBrokerSnapshot,
  order: PaperOrderState,
  price: string,
  qty: string,
  feeRate: string,
  slippage: string,
): PaperFillResult {
  const market = decimals(price);
  // Buying power check: notional at worst-price must be covered by free cash.
  const worst =
    order.type === "limit"
      ? decimals(order.price ?? price)
      : market.plus(slippageRisk(price, slippage));
  const notional = worst.times(qty);
  const fee = notional.times(feeRate);
  const total = notional.plus(fee);

  if (total.gt(state.freeCash)) {
    return {
      status: "REJECTED",
      filledQuantity: "0",
      fee: "0",
      reason: "Insufficient buying power",
    };
  }

  if (order.type === "limit") {
    const limit = decimals(order.price ?? "0");
    // Buy limit fills at or below the limit once the market trades through.
    if (market.gt(limit)) {
      return { status: "OPEN", filledQuantity: "0", fee: "0" };
    }
    const buyFee = limit.times(qty).times(feeRate);
    return {
      status: "FILLED",
      fillPrice: limit.toString(),
      filledQuantity: qty,
      fee: buyFee.toString(),
    };
  }

  const fillPrice = market.plus(slippageRisk(price, slippage));
  const fillFee = fillPrice.times(qty).times(feeRate);
  return {
    status: "FILLED",
    fillPrice: fillPrice.toString(),
    filledQuantity: qty,
    fee: fillFee.toString(),
  };
}

function evaluateSell(
  state: PaperBrokerSnapshot,
  order: PaperOrderState,
  price: string,
  qty: string,
  feeRate: string,
): PaperFillResult {
  const market = decimals(price);
  // Cannot sell more than is currently held.
  const held =
    state.heldQuantity && state.heldQuantity.symbol === order.symbol
      ? decimals(state.heldQuantity.quantity)
      : new Decimal(0);
  if (held.lt(qty)) {
    return {
      status: "REJECTED",
      filledQuantity: "0",
      fee: "0",
      reason: "Insufficient position to sell",
    };
  }

  if (order.type === "limit") {
    const limit = decimals(order.price ?? "0");
    // Sell limit fills at or above the limit.
    if (market.lt(limit)) {
      return { status: "OPEN", filledQuantity: "0", fee: "0" };
    }
    const sellFee = limit.times(qty).times(feeRate);
    return {
      status: "FILLED",
      fillPrice: limit.toString(),
      filledQuantity: qty,
      fee: sellFee.toString(),
    };
  }

  const sellFee = decimals(price).times(qty).times(feeRate);
  return {
    status: "FILLED",
    fillPrice: price,
    filledQuantity: qty,
    fee: sellFee.toString(),
  };
}

function slippageRisk(price: string, slippage: string): Decimal {
  return decimals(price).times(slippage);
}

function decimals(value: import("decimal.js").Decimal.Value): Decimal {
  return new Decimal(value);
}

export function rejectOrder(reason: string): PaperFillResult {
  return { status: "REJECTED", filledQuantity: "0", fee: "0", reason };
}

export function ensureValidOrder(order: PaperOrderState): void {
  const qty = decimals(order.quantity);
  if (qty.lte(0)) {
    throw new InvalidOrderRequestError("quantity must be positive");
  }
  if (order.type === "limit" && decimals(order.price ?? "0").lte(0)) {
    throw new InvalidOrderRequestError("limit orders require a positive price");
  }
  if (order.feeRate !== undefined && decimals(order.feeRate).lt(0)) {
    throw new InvalidOrderRequestError("feeRate must be non-negative");
  }
  if (order.slippage !== undefined && decimals(order.slippage).lt(0)) {
    throw new InvalidOrderRequestError("slippage must be non-negative");
  }
}
