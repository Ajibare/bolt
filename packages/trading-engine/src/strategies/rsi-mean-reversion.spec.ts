import type { Candle, SupportedSymbol } from "@trading-bolt/shared";
import { describe, expect, it } from "vitest";

import { rsiMeanReversionFactory } from "./rsi-mean-reversion.js";

function candles(closes: string[], symbol: SupportedSymbol = "BTCUSDT"): Candle[] {
  const start = 1_700_000_000_000;
  return closes.map((close, index) => ({
    symbol,
    interval: "15m",
    timestamp: start + index * 600_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: "1000",
  }));
}

function strategy(overrides: Partial<Parameters<typeof rsiMeanReversionFactory.create>[0]> = {}) {
  return rsiMeanReversionFactory.create({
    kind: "rsi-mean-reversion",
    period: 2,
    oversold: 30,
    overbought: 70,
    ...overrides,
  });
}

describe("rsiMeanReversionFactory.configSchema", () => {
  it("rejects oversold above 50 or overbought below 50", () => {
    expect(
      rsiMeanReversionFactory.configSchema.safeParse({
        kind: "rsi-mean-reversion",
        period: 14,
        oversold: 60,
        overbought: 70,
      }).success,
    ).toBe(false);
    expect(
      rsiMeanReversionFactory.configSchema.safeParse({
        kind: "rsi-mean-reversion",
        period: 14,
        oversold: 30,
        overbought: 40,
      }).success,
    ).toBe(false);
  });

  it("rejects oversold not below overbought", () => {
    expect(
      rsiMeanReversionFactory.configSchema.safeParse({
        kind: "rsi-mean-reversion",
        period: 14,
        oversold: 70,
        overbought: 70,
      }).success,
    ).toBe(false);
  });

  it("rejects a non-positive period", () => {
    expect(
      rsiMeanReversionFactory.configSchema.safeParse({
        kind: "rsi-mean-reversion",
        period: 0,
        oversold: 30,
        overbought: 70,
      }).success,
    ).toBe(false);
  });

  it("accepts a valid config", () => {
    expect(
      rsiMeanReversionFactory.configSchema.safeParse({
        kind: "rsi-mean-reversion",
        period: 14,
        oversold: 30,
        overbought: 70,
      }).success,
    ).toBe(true);
  });
});

describe("rsiMeanReversionStrategy", () => {
  it("sells when the latest RSI is at or above the overbought threshold", () => {
    const series = candles(["1", "2", "3", "4", "5", "6"]);

    const signal = strategy().evaluate(series);

    expect(signal.direction).toBe("sell");
    expect(signal.reason).toContain("overbought");
    expect(signal.strategyId).toBe("rsi-mean-reversion");
    expect(signal.timestamp).toBe(series[series.length - 1].timestamp);
  });

  it("buys when the latest RSI is at or below the oversold threshold", () => {
    const series = candles(["6", "5", "4", "3", "2", "1"]);

    const signal = strategy().evaluate(series);

    expect(signal.direction).toBe("buy");
    expect(signal.reason).toContain("oversold");
  });

  it("holds when RSI sits between the thresholds", () => {
    const series = candles(["1", "2", "1", "2", "1", "2"]);

    const signal = strategy().evaluate(series);

    expect(signal.direction).toBe("hold");
    expect(signal.reason).toContain("between");
  });

  it("treats a flat market as overbought per the documented RSI boundary rule", () => {
    const signal = strategy().evaluate(candles(["1", "1", "1", "1"]));

    expect(signal.direction).toBe("sell");
    expect(signal.reason).toContain("overbought");
  });

  it("holds with insufficient data", () => {
    const signal = strategy().evaluate(candles(["1", "2"]));

    expect(signal.direction).toBe("hold");
    expect(signal.reason).toContain("insufficient data");
  });

  it("is deterministic across repeated evaluations", () => {
    const series = candles(["6", "5", "4", "3", "2", "1"]);
    const first = strategy().evaluate(series);
    const second = strategy().evaluate(series);
    expect(second).toEqual(first);
  });
});
