import { describe, expect, it } from "vitest";
import { Candle, div, equals, toDecimal, type Money } from "@trading-bolt/shared";
// Importing the package index registers the built-in strategy factories.
import { createStrategy, SMA_CROSSOVER_ID } from "../index.js";
import { BacktestConfig, BacktestError, runBacktest } from "./backtest.js";

function candles(closes: string[]): Candle[] {
  const start = 1_700_000_000_000;
  return closes.map((close, index) => ({
    symbol: "BTCUSDT",
    interval: "15m",
    timestamp: start + index * 600_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: "1000",
  }));
}

const smaConfig = { kind: SMA_CROSSOVER_ID, fastPeriod: 2, slowPeriod: 3 };

function config(closes: string[], overrides?: Partial<BacktestConfig>): BacktestConfig {
  return {
    strategy: createStrategy(SMA_CROSSOVER_ID, smaConfig),
    candles: candles(closes),
    startingBalance: "10000" as Money,
    feeRate: "0",
    slippageRate: "0",
    ...overrides,
  };
}

describe("runBacktest", () => {
  it("throws when given no candles", () => {
    expect(() => runBacktest(config([]))).toThrow(BacktestError);
  });

  it("throws when startingBalance is zero or negative", () => {
    expect(() => runBacktest(config(["100", "110", "120"], { startingBalance: "0" }))).toThrow(
      BacktestError,
    );
    expect(() => runBacktest(config(["100", "110", "120"], { startingBalance: "-1" }))).toThrow(
      BacktestError,
    );
  });

  it("throws when fee or slippage rate is negative", () => {
    expect(() => runBacktest(config(["100", "110", "120"], { feeRate: "-0.01" }))).toThrow(
      BacktestError,
    );
    expect(() => runBacktest(config(["100", "110", "120"], { slippageRate: "-0.01" }))).toThrow(
      BacktestError,
    );
  });

  it("throws when candles are not strictly ascending", () => {
    const notAscending = candles(["100", "110", "120"]);
    notAscending[2] = { ...notAscending[2], timestamp: notAscending[1].timestamp };
    expect(() => runBacktest({ ...config(["100"]), candles: notAscending })).toThrow(BacktestError);
  });

  it("marks an open position to market without forcing liquidation", () => {
    // BUY at bar 3 close 110 after a dip; price keeps rising, no bear cross.
    const result = runBacktest(config(["100", "90", "80", "110", "150", "200", "250", "300"]));
    expect(result.metrics.closedTrades).toBe(0);
    // netProfit is mark-to-market, so it reflects the open gain, not "0".
    expect(toDecimal(result.metrics.netProfit).gt(0)).toBe(true);
    expect(result.equityCurve[7].equity).not.toBe("10000.00");
  });

  it("executes no trades when strategy holds flatly", () => {
    const result = runBacktest(config(["100", "100", "100", "100", "100"]));
    expect(result.trades).toHaveLength(0);
    expect(result.equityCurve).toHaveLength(5);
    expect(result.equityCurve[0].equity).toBe("10000.00");
    expect(result.equityCurve[4].equity).toBe("10000.00");
    expect(result.metrics.netProfit).toBe("0.00");
    expect(result.metrics.closedTrades).toBe(0);
    expect(result.metrics.maxDrawdown).toBe(0);
  });

  it("realizes a winning round trip (zero cost)", () => {
    // BUY at bar 4 close 90, SELL at bar 5 close 100.
    const result = runBacktest(config(["100", "90", "80", "100", "90", "100"]));
    expect(result.metrics.closedTrades).toBe(1);
    expect(result.metrics.winningTrades).toBe(1);
    expect(result.metrics.losingTrades).toBe(0);
    expect(result.metrics.winRate).toBe(1);
    expect(result.metrics.totalFeesPaid).toBe("0.00");
    expect(result.metrics.maxDrawdown).toBe(0);
    // Net profit = 10000 * (100/90 - 1) = 1111.111..., formatted to 2dp.
    expect(result.metrics.netProfit).toBe("1111.11");
  });

  it("realizes a losing round trip (zero cost) with drawdown", () => {
    // BUY at bar 3 close 110, SELL at bar 4 close 50 — deep loss and drawdown.
    const result = runBacktest(config(["100", "90", "80", "110", "50", "50", "50"]));
    expect(result.metrics.closedTrades).toBe(1);
    expect(result.metrics.winningTrades).toBe(0);
    expect(result.metrics.losingTrades).toBe(1);
    expect(result.metrics.winRate).toBe(0);
    expect(toDecimal(result.metrics.netProfit).lt(0)).toBe(true);
    expect(result.metrics.maxDrawdown).toBeGreaterThan(0);
  });

  it("deducts fees when feeRate is nonzero", () => {
    const feeFree = runBacktest(config(["100", "90", "80", "100", "90", "100"]));
    const withFee = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], {
        feeRate: "0.001",
      }),
    );
    expect(toDecimal(withFee.metrics.totalFeesPaid).gt(0)).toBe(true);
    expect(
      toDecimal(withFee.metrics.endingBalance).lt(toDecimal(feeFree.metrics.endingBalance)),
    ).toBe(true);
  });

  it("slippage reduces the net profit of a winning trade", () => {
    const noSlip = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], { feeRate: "0.001" }),
    );
    const withSlip = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], {
        feeRate: "0.001",
        slippageRate: "0.01",
      }),
    );
    expect(
      toDecimal(withSlip.metrics.endingBalance).lt(toDecimal(noSlip.metrics.endingBalance)),
    ).toBe(true);
  });

  it("records a deterministic equity curve with realized fill prices", () => {
    const result = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], {
        feeRate: "0.001",
        slippageRate: "0.01",
      }),
    );
    // Re-running produces identical results.
    const rerun = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], {
        feeRate: "0.001",
        slippageRate: "0.01",
      }),
    );
    expect(result).toEqual(rerun);
    // One buy (90 * 1.01 = 90.90) and one sell (100 * 0.99 = 99.00).
    expect(result.trades.map((t) => t.side)).toEqual(["buy", "sell"]);
    expect(result.trades[0].price).toBe("90.90");
    expect(result.trades[1].price).toBe("99.00");
  });

  it("computes totalReturn from netProfit and startingBalance", () => {
    const result = runBacktest(config(["100", "90", "80", "100", "90", "100"]));
    const expected = div(
      toDecimal(result.metrics.netProfit),
      toDecimal(result.metrics.startingBalance),
    ).toNumber();
    expect(Math.abs(result.metrics.totalReturn - expected)).toBeLessThan(1e-10);
    expect(equals(toDecimal(result.metrics.netProfit), toDecimal("1111.11"), 2)).toBe(true);
  });

  it("uses positionSize to deploy only a fraction of the balance", () => {
    // BUY at bar 4 close 90, SELL at bar 5 close 100.
    const allIn = runBacktest(config(["100", "90", "80", "100", "90", "100"]));
    const half = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], {
        positionSize: "0.5",
      }),
    );
    const quarter = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], {
        positionSize: "0.25",
      }),
    );
    expect(allIn.metrics.netProfit).toBe("1111.11");
    expect(half.metrics.netProfit).toBe("555.56");
    expect(quarter.metrics.netProfit).toBe("277.78");
    // Half sizing leaves cash idle; ending equity = kept cash + realized gain.
    expect(half.metrics.endingBalance).toBe("10555.56");
  });

  it("rejects an invalid position size", () => {
    expect(() => runBacktest(config(["100"], { positionSize: "0" }))).toThrow(BacktestError);
    expect(() => runBacktest(config(["100"], { positionSize: "1.5" }))).toThrow(BacktestError);
  });

  it("ignores SELL signals while flat when allowShort is false", () => {
    // Bearish crossover at bar 3 (close 90) must not open a short.
    const result = runBacktest(config(["100", "110", "120", "90", "50", "20", "10", "50"]));
    expect(result.metrics.closedTrades).toBe(0);
    expect(result.metrics.netProfit).toBe("0.00");
  });

  it("opens and closes a losing short when allowShort is true", () => {
    // SELL at bar 3 close 90 (short open), BUY at bar 5 close 100 (cover).
    const result = runBacktest(
      config(["100", "110", "120", "90", "85", "100"], {
        allowShort: true,
      }),
    );
    expect(result.trades.map((t) => t.side)).toEqual(["sell", "buy"]);
    expect(result.trades[0].quantity).toBe("-111.11"); // -10000/90
    expect(result.metrics.closedTrades).toBe(1);
    expect(result.metrics.winningTrades).toBe(0);
    expect(result.metrics.losingTrades).toBe(1);
    // Short 90, cover 100 -> loss of 10000 * (10/90) = 1111.11...
    expect(result.metrics.netProfit).toBe("-1111.11");
  });

  it("profits on a short when the price keeps falling", () => {
    // SELL at bar 3 close 90 (short), cover at the first bullish cross (50).
    const result = runBacktest(
      config(["100", "110", "120", "90", "50", "30", "20", "50"], {
        allowShort: true,
      }),
    );
    expect(result.metrics.closedTrades).toBe(1);
    expect(result.metrics.winningTrades).toBe(1);
    expect(result.metrics.losingTrades).toBe(0);
    expect(result.metrics.netProfit).toBe("4444.44");
  });

  it("reports profitFactor as null when there are no losses", () => {
    const win = runBacktest(config(["100", "90", "80", "100", "90", "100"]));
    expect(win.metrics.closedTrades).toBe(1);
    expect(win.metrics.profitFactor).toBeNull();
  });

  it("reports profitFactor as 0 when there are no wins", () => {
    const loss = runBacktest(config(["100", "90", "80", "110", "50", "50", "50"]));
    expect(loss.metrics.closedTrades).toBe(1);
    expect(loss.metrics.profitFactor).toBe(0);
  });

  it("returns null Sharpe for a flat equity curve", () => {
    const result = runBacktest(config(["100", "100", "100", "100", "100"]));
    expect(result.metrics.sharpe).toBeNull();
  });

  it("returns a finite Sharpe with a risk-free shift", () => {
    const base = runBacktest(config(["100", "90", "80", "100", "90", "100"]));
    expect(base.metrics.sharpe).not.toBeNull();
    const withRf = runBacktest(
      config(["100", "90", "80", "100", "90", "100"], {
        riskFreeRate: "0.001",
      }),
    );
    expect(withRf.metrics.sharpe).not.toBeNull();
    expect(withRf.metrics.sharpe as number).toBeLessThan(base.metrics.sharpe as number);
  });

  it("rejects a negative risk-free rate", () => {
    expect(() => runBacktest(config(["100"], { riskFreeRate: "-0.001" }))).toThrow(BacktestError);
  });
});
