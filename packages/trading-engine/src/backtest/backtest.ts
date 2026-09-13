import type { Decimal } from "decimal.js";
import {
  add,
  div,
  format,
  isNegative,
  isZero,
  max as decimalMax,
  mul,
  sub,
  toDecimal,
  type Candle,
  type Money,
} from "@trading-bolt/shared";
import type { Strategy } from "../strategy.js";

export class BacktestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BacktestError";
  }
}

export interface BacktestConfig {
  /** Strategy instance produced via `createStrategy` (already zod-validated). */
  strategy: Strategy;
  /** Candles in ASCENDING timestamp order. Only `[0..i]` inform bar `i` — no look-ahead. */
  candles: ReadonlyArray<Candle>;
  /** Starting cash balance, decimal string. */
  startingBalance: Money;
  /** Per-side fee rate applied to each transacted notional, e.g. "0.001". */
  feeRate: Money;
  /** Per-fill slippage rate applied to the decision-bar close, e.g. "0.0005". */
  slippageRate: Money;
  /**
   * Fraction of current (unleveraged) balance deployed per trade. `1` = all-in
   * (default), `0 < positionSize <= 1`.
   */
  positionSize?: Money;
  /** Whether SELL signals while flat open a short position (default false). */
  allowShort?: boolean;
  /** Per-bar risk-free rate used by Sharpe, a decimal fraction (default "0"). */
  riskFreeRate?: Money;
}

export interface BacktestTrade {
  side: "buy" | "sell";
  timestamp: number;
  /** Actual fill price (decision-bar close +/- slippage). */
  price: Money;
  /** Quantity; negative for an opening short. */
  quantity: Money;
  fee: Money;
  /**
   * Set on closing trades only. Long: net proceeds - cost basis. Short:
   * margin received - (cover notional + cover fee).
   */
  realizedPnl: Money | null;
}

export interface EquityPoint {
  timestamp: number;
  cash: Money;
  positionValue: Money;
  /** Mark-to-market equity = cash + positionValue (negative positionValue when short). */
  equity: Money;
}

export interface BacktestMetrics {
  startingBalance: Money;
  /** Mark-to-market ending balance (open positions use their last close). */
  endingBalance: Money;
  /** `endingBalance - startingBalance`; includes unrealized gains/losses. */
  netProfit: Money;
  /** Fractional total return, e.g. "0.1234" for +12.34%. */
  totalReturn: number;
  totalFeesPaid: Money;
  closedTrades: number;
  winningTrades: number;
  losingTrades: number;
  /** winning / closedTrades (0 when no closed trades). */
  winRate: number;
  /** Fractional max peak-to-trough drawdown of mark-to-market equity. */
  maxDrawdown: number;
  /**
   * grossProfit / grossLoss over closed trades. `null` when undefined: no
   * closed trades, all results break-even, or zero losing trades.
   */
  profitFactor: number | null;
  /**
   * Bar-level Sharpe ratio over per-bar equity returns (sample std), using the
   * configured `riskFreeRate` per bar. `null` when fewer than two returns exist
   * or the standard deviation is zero.
   */
  sharpe: number | null;
}

export interface BacktestResult {
  metrics: BacktestMetrics;
  equityCurve: ReadonlyArray<EquityPoint>;
  trades: ReadonlyArray<BacktestTrade>;
}

const ZERO = "0";

function sampleStd(values: ReadonlyArray<Decimal>): Decimal {
  if (values.length < 2) {
    return toDecimal(ZERO);
  }
  const count = toDecimal(String(values.length));
  let sum = toDecimal(ZERO);
  for (const value of values) {
    sum = add(sum, value);
  }
  const mean = div(sum, count);
  let sumSquares = toDecimal(ZERO);
  for (const value of values) {
    const diff = sub(value, mean);
    sumSquares = add(sumSquares, mul(diff, diff));
  }
  return div(sumSquares, sub(count, 1)).sqrt();
}

/**
 * Deterministic backtest over candles, long or short.
 *
 * Model (documented — no intra-bar fills):
 * - Signals are evaluated on the candles available up to and including the
 *   current bar, so no future data ever informs a decision (no look-ahead).
 * - A BUY while flat opens a long deploying `balance * positionSize` at the
 *   bar close + slippage (less the buy fee). A SELL while flat opens a short
 *   (when `allowShort`) using the same sizing at the close - slippage. The
 *   opposite signal closes the open side; HOLD / repeat / same-side signals
 *   are ignored. Only one order is evaluated per bar.
 * - Every bar marks the open position to market on its close. Open positions
 *   are NOT force-liquidated at the end.
 * - All arithmetic is decimal (`decimal.js`); nothing is rounded mid-simulation.
 */
export function runBacktest(config: BacktestConfig): BacktestResult {
  const {
    strategy,
    candles,
    startingBalance,
    feeRate,
    slippageRate,
    positionSize = "1",
    allowShort = false,
    riskFreeRate = "0",
  } = config;

  if (candles.length === 0) {
    throw new BacktestError("Cannot backtest with no candles");
  }
  for (let index = 1; index < candles.length; index += 1) {
    if (candles[index].timestamp <= candles[index - 1].timestamp) {
      throw new BacktestError("Candles must be strictly ascending by timestamp");
    }
  }

  const start = toDecimal(startingBalance);
  if (start.lte(0)) {
    throw new BacktestError("startingBalance must be positive");
  }

  const fee = toDecimal(feeRate);
  const slippage = toDecimal(slippageRate);
  if (isNegative(fee) || isNegative(slippage)) {
    throw new BacktestError("feeRate and slippageRate must not be negative");
  }

  const size = toDecimal(positionSize);
  if (size.lte(0) || size.gt(1)) {
    throw new BacktestError("positionSize must be in the open interval (0, 1]");
  }

  const riskFree = toDecimal(riskFreeRate);
  if (isNegative(riskFree)) {
    throw new BacktestError("riskFreeRate must not be negative");
  }

  let cash = start;
  let quantity = toDecimal(ZERO);
  let entryCost: Decimal | null = null;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];
    const signal = strategy.evaluate(candles.slice(0, index + 1));
    const close = toDecimal(candle.close);

    if (signal.direction === "buy") {
      if (quantity.lt(0)) {
        // Close a short position.
        const fillPrice = mul(close, add(1, slippage));
        const coverNotional = mul(quantity.abs(), fillPrice);
        const feeAmount = mul(coverNotional, fee);
        const realizedPnl =
          entryCost === null ? null : sub(entryCost, add(coverNotional, feeAmount));
        cash = sub(cash, add(coverNotional, feeAmount));
        trades.push({
          side: "buy",
          timestamp: candle.timestamp,
          price: format(fillPrice),
          quantity: format(quantity.abs()),
          fee: format(feeAmount),
          realizedPnl: realizedPnl === null ? null : format(realizedPnl),
        });
        quantity = toDecimal(ZERO);
        entryCost = null;
      } else if (isZero(quantity)) {
        // Open a long position.
        const equity = add(cash, mul(quantity, close));
        const notional = mul(equity, size);
        const feeAmount = mul(notional, fee);
        const budget = sub(notional, feeAmount);
        const fillPrice = mul(close, add(1, slippage));
        if (budget.gt(0)) {
          entryCost = notional;
          quantity = div(budget, fillPrice);
          cash = sub(cash, notional);
          trades.push({
            side: "buy",
            timestamp: candle.timestamp,
            price: format(fillPrice),
            quantity: format(quantity),
            fee: format(feeAmount),
            realizedPnl: null,
          });
        }
      }
    } else if (signal.direction === "sell") {
      if (quantity.gt(0)) {
        // Close a long position.
        const fillPrice = mul(close, sub(1, slippage));
        const proceeds = mul(quantity, fillPrice);
        const feeAmount = mul(proceeds, fee);
        const netProceeds = sub(proceeds, feeAmount);
        const realizedPnl = entryCost === null ? null : sub(netProceeds, entryCost);
        cash = add(cash, netProceeds);
        trades.push({
          side: "sell",
          timestamp: candle.timestamp,
          price: format(fillPrice),
          quantity: format(quantity),
          fee: format(feeAmount),
          realizedPnl: realizedPnl === null ? null : format(realizedPnl),
        });
        quantity = toDecimal(ZERO);
        entryCost = null;
      } else if (isZero(quantity) && allowShort) {
        // Open a short position.
        const equity = add(cash, mul(quantity, close));
        const margin = mul(equity, size);
        const feeAmount = mul(margin, fee);
        const budget = sub(margin, feeAmount);
        const fillPrice = mul(close, sub(1, slippage));
        if (budget.gt(0)) {
          entryCost = margin;
          quantity = div(budget, fillPrice).neg();
          cash = add(cash, margin);
          trades.push({
            side: "sell",
            timestamp: candle.timestamp,
            price: format(fillPrice),
            quantity: format(quantity),
            fee: format(feeAmount),
            realizedPnl: null,
          });
        }
      }
    }

    const positionValue = mul(quantity, close);
    const equity = add(cash, positionValue);
    equityCurve.push({
      timestamp: candle.timestamp,
      cash: format(cash),
      positionValue: format(positionValue),
      equity: format(equity),
    });
  }

  const ending = equityCurve[equityCurve.length - 1];
  const starting = toDecimal(startingBalance);
  const endingBalance = toDecimal(ending.equity);
  const netProfit = sub(endingBalance, starting);
  const totalReturn = div(netProfit, starting).toNumber();

  const closedTrades = trades.filter((trade) => trade.realizedPnl !== null);
  const winningTrades = closedTrades.filter((trade) => toDecimal(trade.realizedPnl as Money).gt(0));
  const losingTrades = closedTrades.filter((trade) => toDecimal(trade.realizedPnl as Money).lt(0));

  let totalFees = toDecimal(ZERO);
  let grossProfit = toDecimal(ZERO);
  let grossLoss = toDecimal(ZERO);
  for (const trade of trades) {
    totalFees = add(totalFees, trade.fee);
    if (trade.realizedPnl !== null) {
      const pnl = toDecimal(trade.realizedPnl);
      if (pnl.gt(0)) {
        grossProfit = add(grossProfit, pnl);
      } else if (pnl.lt(0)) {
        grossLoss = add(grossLoss, pnl.abs());
      }
    }
  }

  const profitFactor: number | null = grossLoss.isZero()
    ? null
    : div(grossProfit, grossLoss).toNumber();

  let peak = toDecimal(ZERO);
  let maxDrawdown = 0;
  for (const point of equityCurve) {
    const equity = toDecimal(point.equity);
    peak = decimalMax(peak, equity);
    if (peak.gt(0)) {
      const drawdown = sub(peak, equity).div(peak).toNumber();
      maxDrawdown = Math.max(maxDrawdown, drawdown);
    }
  }

  let sharpe: number | null = null;
  const returns: Decimal[] = [];
  for (let index = 1; index < equityCurve.length; index += 1) {
    const previous = toDecimal(equityCurve[index - 1].equity);
    const current = toDecimal(equityCurve[index].equity);
    if (!previous.isZero()) {
      returns.push(div(sub(current, previous), previous));
    }
  }
  if (returns.length >= 2) {
    const deviation = sampleStd(returns);
    if (!deviation.isZero()) {
      const mean = div(
        returns.reduce((sum, value) => add(sum, value), toDecimal(ZERO)),
        toDecimal(String(returns.length)),
      );
      sharpe = div(sub(mean, riskFree), deviation).toNumber();
    }
  }

  return {
    metrics: {
      startingBalance: format(starting),
      endingBalance: format(endingBalance),
      netProfit: format(netProfit),
      totalReturn,
      totalFeesPaid: format(totalFees),
      closedTrades: closedTrades.length,
      winningTrades: winningTrades.length,
      losingTrades: losingTrades.length,
      winRate: closedTrades.length === 0 ? 0 : winningTrades.length / closedTrades.length,
      maxDrawdown,
      profitFactor,
      sharpe,
    },
    equityCurve,
    trades,
  };
}
