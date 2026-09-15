import { Decimal } from "decimal.js";
import type { Money } from "@trading-bolt/shared";
import type {
  BrokerAccountState,
  BrokerOrder,
  BrokerOrderStatus,
  BrokerPosition,
  BrokerSide,
} from "../broker.interface.js";
import { InvalidOrderRequestError } from "../errors.js";
import type {
  BybitCoinBalance,
  BybitOrderItem,
  BybitPositionItem,
  BybitOrderSide,
} from "./types.js";

/**
 * Mapping between the Bybit v5 wire format and the BrokerAdapter domain
 * (AGENTS.md §12). Order statuses map only to the allowed BrokerOrderStatus
 * set; anything unmapped fails loudly rather than guessing (AGENTS.md §24).
 */

export function mapOrderSide(side: BrokerSide): BybitOrderSide {
  return side === "buy" ? "Buy" : "Sell";
}

/** Maps a Bybit orderStatus to the normalized BrokerOrderStatus set. */
export function mapOrderStatus(raw: string): BrokerOrderStatus {
  switch (raw) {
    case "Created":
    case "New":
      return raw === "Created" ? "CREATED" : "ACCEPTED";
    case "PartiallyFilled":
      return "PARTIALLY_FILLED";
    case "PartiallyFilledCanceled":
    case "Canceled":
    case "Deactivated":
    case "PendingCancel":
      return "CANCELLED";
    case "Filled":
      return "FILLED";
    case "Rejected":
      return "REJECTED";
    case "Untriggered":
    case "Triggered":
      return "FAILED";
    default:
      throw new Error(`Unknown Bybit order status: ${JSON.stringify(raw)}`);
  }
}

function numberOrZero(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Maps a Bybit order item to the normalized BrokerOrder. */
export function mapOrderItem(item: BybitOrderItem): BrokerOrder {
  const qty = new Decimal(item.qty || "0");
  const filled = new Decimal(item.cumExecQty || "0");
  const avgRaw = new Decimal(item.avgPrice || "0");
  const avgFillPrice = filled.gt(0) && avgRaw.gt(0) ? avgRaw.toString() : null;
  const orderCourse: BrokerOrder = {
    id: item.orderId,
    clientOrderId: item.orderLinkId || item.orderId,
    side: item.side === "Buy" ? "buy" : "sell",
    type: item.orderType === "Limit" ? "limit" : "market",
    symbol: item.symbol,
    quantity: qty.toString(),
    price: item.price && new Decimal(item.price).gt(0) ? item.price : undefined,
    stopLoss: item.stopLoss ? item.stopLoss : undefined,
    takeProfit: item.takeProfit ? item.takeProfit : undefined,
    reduceOnly: item.reduceOnly,
    reason:
      item.orderStatus === "Rejected"
        ? `Bybit rejection: ${item.rejectReason || "no reason"}`.trim()
        : undefined,
    avgFillPrice,
    filledQuantity: filled.toString(),
    fees: "0",
    status: mapOrderStatus(item.orderStatus),
    createdAt: numberOrZero(item.createdTime),
    updatedAt: numberOrZero(item.updatedTime),
  };
  return orderCourse;
}

/** Maps a Bybit position to a signed BrokerPosition (long + / short -). */
export function mapPosition(item: BybitPositionItem): BrokerPosition {
  const size = new Decimal(item.size);
  const signed = item.side === "Buy" ? size : size.negated();
  const stopLoss = item.stopLoss && new Decimal(item.stopLoss).gt(0) ? item.stopLoss : undefined;
  const takeProfit =
    item.takeProfit && new Decimal(item.takeProfit).gt(0) ? item.takeProfit : undefined;
  return {
    symbol: item.symbol,
    quantity: signed.toString(),
    avgEntryPrice: item.avgPrice || "0",
    stopLoss,
    takeProfit,
    fees: "0",
  };
}

/** Maps the Bybit wallet balance envelope to BrokerAccountState. */
export function mapWallet(list: BybitCoinBalance[]): BrokerAccountState {
  return {
    balances: list.map((coin) => {
      const total = new Decimal(coin.walletBalance);
      const free = new Decimal(coin.availableToWithdraw);
      const used = total.minus(free);
      return {
        asset: coin.coin,
        free: free.toString(),
        used: used.toString(),
        total: total.toString(),
      };
    }),
  };
}

/**
 * Floor `value` down to the nearest multiple of `step` (decimal-exact). A
 * quantity must not exceed the exchange lot size; floors toward zero so we
 * never submit an invalid (oversized-fractional) order.
 */
export function floorToStep(value: Money, step: Money): string {
  const stepValue = new Decimal(step);
  if (stepValue.lte(0)) {
    return new Decimal(value).toString();
  }
  return new Decimal(value).div(stepValue).floor().times(stepValue).toString();
}

/** Round `value` to the nearest multiple of `step` (for limit prices). */
export function roundToStep(value: Money, step: Money): string {
  const stepValue = new Decimal(step);
  if (stepValue.lte(0)) {
    return new Decimal(value).toString();
  }
  return new Decimal(value).div(stepValue).round().times(stepValue).toString();
}

/** Normalize a quantity to the instrument lot size, rejecting zero results. */
export function normalizeQuantity(quantity: Money, qtyStep: Money, label: string): string {
  const normalized = floorToStep(quantity, qtyStep);
  if (new Decimal(normalized).lte(0)) {
    throw new InvalidOrderRequestError(
      `Quantity "${quantity}" normalizes to 0 at lot size ${qtyStep} for ${label}`,
    );
  }
  return normalized;
}

/**
 * Builds a sorted, URL-encoded query string for GET endpoints. Parameters must
 * be sorted for the request signature to match the server.
 */
export function buildQueryString(params: Record<string, string>): string {
  return Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .sort()
    .join("&");
}
