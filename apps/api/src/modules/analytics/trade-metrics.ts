import {
  abs,
  add,
  div,
  min,
  mul,
  round,
  sub,
  toDecimal,
} from '@trading-bolt/shared';

type Decimal = ReturnType<typeof toDecimal>;

const RATIO_PRECISION = 8;
const MONEY_PRECISION = 8;

/** Structural view of the order fields the FIFO engine reads. */
export interface FilledOrderLike {
  symbol: string;
  side: 'buy' | 'sell';
  filledQuantity: string;
  avgFillPrice: string | null;
  fees: string;
  createdAt: Date;
}

export interface RoundTripTrade {
  symbol: string;
  direction: 'long' | 'short';
  quantity: string;
  entryPrice: string;
  exitPrice: string;
  entryTime: number;
  exitTime: number;
  /** Price movement only, before fees. */
  grossPnl: string;
  /** Entry + exit fees allocated to the matched quantity. */
  fees: string;
  /** grossPnl - fees. */
  netPnl: string;
  /** True when netPnl is strictly positive. */
  won: boolean;
}

export interface TradeMetrics {
  tradeCount: number;
  winCount: number;
  lossCount: number;
  breakEvenCount: number;
  /** Closed trades that ended with net profit / all closed trades. */
  winRate: string;
  /** Sum of net P&L across all round trips (may be negative). */
  netPnl: string;
  /** Sum of positive net P&L. */
  grossProfit: string;
  /** Sum of the magnitude of negative net P&L (>= 0). */
  grossLoss: string;
  averageWin: string;
  /** Average losing trade magnitude (>= 0). */
  averageLoss: string;
  /** grossProfit / grossLoss; null when there are no losing trades. */
  profitFactor: string | null;
  totalFees: string;
}

interface OpenLot {
  quantity: Decimal;
  price: Decimal;
  feePerUnit: Decimal;
  time: number;
}

function ratio(value: Decimal): string {
  return round(value, RATIO_PRECISION).toFixed(RATIO_PRECISION);
}

function money(value: Decimal): string {
  return round(value, MONEY_PRECISION).toFixed(MONEY_PRECISION);
}

/**
 * Rebuilds closed round-trip trades from filled orders using FIFO accounting
 * per symbol (AGENTS.md §14 — deterministic decimal math, no floating point).
 *
 * Buys open long lots and match sells oldest-first; sells open short lots and
 * match buys oldest-first. When an order exceeds the opposite side it closes
 * what it can and opens a new lot in the flipped direction. Fees are allocated
 * pro-rata to the matched quantity so a partially-closing order splits its fee
 * between the closed trade and the residual lot.
 */
export function reconstructTrades(orders: FilledOrderLike[]): RoundTripTrade[] {
  const bySymbol = new Map<string, FilledOrderLike[]>();

  for (const order of orders) {
    if (order.avgFillPrice === null) {
      continue;
    }
    if (toDecimal(order.filledQuantity).lessThanOrEqualTo(0)) {
      continue;
    }
    const list = bySymbol.get(order.symbol) ?? [];
    list.push(order);
    bySymbol.set(order.symbol, list);
  }

  const trades: RoundTripTrade[] = [];
  for (const [symbol, symbolOrders] of bySymbol) {
    symbolOrders.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    runFifo(symbol, symbolOrders, trades);
  }

  return trades.sort((a, b) => a.exitTime - b.exitTime);
}

function runFifo(
  symbol: string,
  orders: FilledOrderLike[],
  out: RoundTripTrade[],
): void {
  let lots: OpenLot[] = [];
  let direction: 'long' | 'short' | null = null;

  for (const order of orders) {
    const quantity = toDecimal(order.filledQuantity);
    const price = toDecimal(order.avgFillPrice as string);
    const feePerUnit = div(order.fees, quantity);
    let remaining = quantity;

    if (direction === null) {
      direction = order.side === 'buy' ? 'long' : 'short';
      lots.push(lotFor(remaining, price, feePerUnit, order.createdAt));
      continue;
    }

    const isClosing =
      (direction === 'long' && order.side === 'sell') ||
      (direction === 'short' && order.side === 'buy');

    if (!isClosing) {
      lots.push(lotFor(remaining, price, feePerUnit, order.createdAt));
      continue;
    }

    while (remaining.greaterThan(0) && lots.length > 0) {
      const lot = lots[0];
      const matched = min(lot.quantity, remaining);
      const fees = add(mul(lot.feePerUnit, matched), mul(feePerUnit, matched));
      const gross =
        direction === 'long'
          ? mul(sub(price, lot.price), matched)
          : mul(sub(lot.price, price), matched);
      const net = sub(gross, fees);

      out.push({
        symbol,
        direction,
        quantity: money(matched),
        entryPrice: lot.price.toString(),
        exitPrice: price.toString(),
        entryTime: lot.time,
        exitTime: order.createdAt.getTime(),
        grossPnl: money(gross),
        fees: money(fees),
        netPnl: money(net),
        won: net.greaterThan(0),
      });

      lot.quantity = sub(lot.quantity, matched);
      remaining = sub(remaining, matched);
      if (!lot.quantity.greaterThan(0)) {
        lots.shift();
      }
    }

    if (remaining.greaterThan(0)) {
      direction = direction === 'long' ? 'short' : 'long';
      lots = [lotFor(remaining, price, feePerUnit, order.createdAt)];
    }
  }
}

function lotFor(
  quantity: Decimal,
  price: Decimal,
  feePerUnit: Decimal,
  time: Date,
): OpenLot {
  return { quantity, price, feePerUnit, time: time.getTime() };
}

/**
 * Aggregates round-trip trades into headline performance metrics. Win rate is
 * wins / all closed trades; break-even trades count in the denominator but
 * not as wins or losses. `profitFactor` is null when there are no losing
 * trades (infinite ratio is not represented as a fake number).
 */
export function summarizeTrades(trades: RoundTripTrade[]): TradeMetrics {
  let grossProfit = toDecimal(0);
  let grossLoss = toDecimal(0);
  let totalFees = toDecimal(0);
  let winCount = 0;
  let lossCount = 0;
  let breakEvenCount = 0;

  for (const trade of trades) {
    const net = toDecimal(trade.netPnl);
    totalFees = add(totalFees, trade.fees);
    if (net.greaterThan(0)) {
      winCount += 1;
      grossProfit = add(grossProfit, net);
    } else if (net.lessThan(0)) {
      lossCount += 1;
      grossLoss = add(grossLoss, abs(net));
    } else {
      breakEvenCount += 1;
    }
  }

  const tradeCount = trades.length;

  return {
    tradeCount,
    winCount,
    lossCount,
    breakEvenCount,
    winRate:
      tradeCount === 0 ? ratio(toDecimal(0)) : ratio(div(winCount, tradeCount)),
    netPnl: money(sub(grossProfit, grossLoss)),
    grossProfit: money(grossProfit),
    grossLoss: money(grossLoss),
    averageWin:
      winCount === 0 ? money(toDecimal(0)) : money(div(grossProfit, winCount)),
    averageLoss:
      lossCount === 0 ? money(toDecimal(0)) : money(div(grossLoss, lossCount)),
    profitFactor: grossLoss.isZero()
      ? null
      : ratio(div(grossProfit, grossLoss)),
    totalFees: money(totalFees),
  };
}
