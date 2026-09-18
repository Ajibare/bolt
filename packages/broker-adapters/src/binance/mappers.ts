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
import {
  BINANCE_BASE_ASSET,
  type BinanceAccountInfo,
  type BinanceMyTrade,
  type BinanceOrderSide,
  type BinanceOrderStatus,
  type BinanceOrderType,
} from "./types.js";

/**
 * Mapping between the Binance spot wire format and the BrokerAdapter domain
 * (AGENTS.md §12). Order statuses map only to the allowed BrokerOrderStatus
 * set; anything unmapped fails loudly rather than guessing (AGENTS.md §24).
 *
 * The quantity/price step helpers mirror the Bybit adapter's — each provider
 * module keeps its own copy so providers never import each other's internals.
 */

/** Sorted, URL-encoded query string. The same string is HMAC-signed. */
export function buildSignatureQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(params[key])}`)
    .sort()
    .join("&");
}

export function mapOrderSide(side: BrokerSide): BinanceOrderSide {
  return side === "buy" ? "BUY" : "SELL";
}

/** Maps a Binance orderStatus to the normalized BrokerOrderStatus set. */
export function mapOrderStatus(raw: string): BrokerOrderStatus {
  switch (raw) {
    case "NEW":
      return "ACCEPTED";
    case "PARTIALLY_FILLED":
      return "PARTIALLY_FILLED";
    case "FILLED":
      return "FILLED";
    case "CANCELED":
    case "EXPIRED":
    case "PENDING_CANCEL":
      return "CANCELLED";
    case "REJECTED":
      return "REJECTED";
    default:
      throw new Error(`Unknown Binance order status: ${JSON.stringify(raw)}`);
  }
}

/** Common subset shared by create/query/open-order responses. */
interface BinanceOrderView {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteQty: string;
  status: BinanceOrderStatus;
  type: BinanceOrderType;
  side: BinanceOrderSide;
}

/** Maps any Binance order view to the normalized BrokerOrder. */
export function mapOrder(
  item: BinanceOrderView,
  createdAt: number,
  updatedAt: number,
): BrokerOrder {
  const quantity = new Decimal(item.origQty || "0");
  const filled = new Decimal(item.executedQty || "0");
  const quote = new Decimal(item.cummulativeQuoteQty || "0");
  const avgFillPrice = filled.gt(0) && quote.gt(0) ? quote.div(filled).toString() : null;
  return {
    id: String(item.orderId),
    clientOrderId: item.clientOrderId || String(item.orderId),
    side: item.side === "BUY" ? "buy" : "sell",
    type: item.type === "LIMIT" ? "limit" : "market",
    symbol: item.symbol,
    quantity: quantity.toString(),
    price: item.price && new Decimal(item.price).gt(0) ? item.price : undefined,
    reason: item.status === "REJECTED" ? "Binance rejected the order" : undefined,
    avgFillPrice,
    filledQuantity: filled.toString(),
    fees: "0",
    status: mapOrderStatus(item.status),
    createdAt,
    updatedAt,
  };
}

/**
 * Maps a spot account's balances to BrokerAccountState. Zero-balance assets
 * are dropped so the monitor only shows real holdings.
 */
export function mapAccountState(account: BinanceAccountInfo): BrokerAccountState {
  return {
    balances: account.balances
      .map((entry) => {
        const free = new Decimal(entry.free || "0");
        const used = new Decimal(entry.locked || "0");
        const total = free.plus(used);
        if (total.isZero()) {
          return null;
        }
        return {
          asset: entry.asset,
          free: free.toString(),
          used: used.toString(),
          total: total.toString(),
        };
      })
      .filter((entry) => entry !== null),
  };
}

/**
 * Maps a spot account's balances to BrokerPosition[] for the supported
 * symbols. Binance spot does not publish a cost basis, so `avgEntryPrice` is
 * reported as "0" (unknown) and must never be used to compute P&L — that is a
 * documented limitation for now. Spot has no short side, so quantities are
 * always positive and derives from free + locked balance.
 */
export function mapPositions(account: BinanceAccountInfo): BrokerPosition[] {
  const heldByAsset = new Map<string, Decimal>();
  for (const entry of account.balances) {
    const total = new Decimal(entry.free || "0").plus(new Decimal(entry.locked || "0"));
    if (!total.isZero()) {
      heldByAsset.set(entry.asset, total);
    }
  }
  const positions: BrokerPosition[] = [];
  for (const [symbol, baseAsset] of Object.entries(BINANCE_BASE_ASSET)) {
    const quantity = heldByAsset.get(baseAsset);
    if (quantity && !quantity.isZero()) {
      positions.push({
        symbol,
        quantity: quantity.toString(),
        avgEntryPrice: "0",
        fees: "0",
      });
    }
  }
  return positions;
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
 * Quote assets Binance settles against. Used to decide which commissions an
 * order's `fees` field can honestly hold (see sumCommissionFees). Longest
 * suffix wins so a symbol like BNBUSDT resolves to USDT, not BNB.
 */
const KNOWN_QUOTE_ASSETS = [
  "FDUSD",
  "BUSD",
  "USDT",
  "USDC",
  "TUSD",
  "DAI",
  "BNB",
  "BTC",
  "ETH",
  "EUR",
  "TRY",
];

/**
 * Derives the quote asset of a Binance spot pair from its symbol suffix.
 * Returns null when the quote is not a known settlement asset.
 */
export function deriveQuoteAsset(symbol: string): string | null {
  let best: string | null = null;
  for (const quote of KNOWN_QUOTE_ASSETS) {
    if (symbol.endsWith(quote) && (best === null || quote.length > best.length)) {
      best = quote;
    }
  }
  return best;
}

/**
 * Sums the fill commissions of an order into a single quote-denominated fee.
 * Only commissions settled in the pair's quote asset are counted — the
 * ledger's `fees` field is quote-denominated. Commissions paid in BNB (fee
 * discount) or the base asset are deliberately NOT converted, because
 * converting would require guessing a price (AGENTS.md §14/§27). Excluded
 * assets are surfaced through nonQuoteCommissionAssets so operators can see
 * the shortfall. Returns "0" when no quote-asset commission exists.
 */
export function sumCommissionFees(
  trades: ReadonlyArray<Pick<BinanceMyTrade, "commission" | "commissionAsset">>,
  quoteAsset: string | null,
): Money {
  if (!quoteAsset) {
    return "0";
  }
  let total = new Decimal(0);
  for (const trade of trades) {
    if (trade.commissionAsset === quoteAsset) {
      total = total.plus(new Decimal(trade.commission || "0"));
    }
  }
  return total.toString();
}

/** Distinct commission assets that were excluded from the fee sum. */
export function nonQuoteCommissionAssets(
  trades: ReadonlyArray<Pick<BinanceMyTrade, "commissionAsset">>,
  quoteAsset: string | null,
): string[] {
  const excluded = new Set<string>();
  for (const trade of trades) {
    if (trade.commissionAsset && trade.commissionAsset !== quoteAsset) {
      excluded.add(trade.commissionAsset);
    }
  }
  return [...excluded];
}
