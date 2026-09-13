import type { Candle, SupportedSymbol } from "@trading-bolt/shared";
import { describe, expect, it } from "vitest";

import { smaCrossoverFactory } from "./sma-crossover.js";

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

function strategy(overrides: Partial<Parameters<typeof smaCrossoverFactory.create>[0]> = {}) {
  return smaCrossoverFactory.create({
    kind: "sma-crossover",
    fastPeriod: 2,
    slowPeriod: 3,
    ...overrides,
  });
}

describe("smaCrossoverFactory.configSchema", () => {
  it("rejects slowPeriod not greater than fastPeriod", () => {
    expect(
      smaCrossoverFactory.configSchema.safeParse({
        kind: "sma-crossover",
        fastPeriod: 5,
        slowPeriod: 4,
      }).success,
    ).toBe(false);
    expect(
      smaCrossoverFactory.configSchema.safeParse({
        kind: "sma-crossover",
        fastPeriod: 5,
        slowPeriod: 5,
      }).success,
    ).toBe(false);
  });

  it("rejects non-integer or non-positive periods", () => {
    expect(
      smaCrossoverFactory.configSchema.safeParse({
        kind: "sma-crossover",
        fastPeriod: 2.5,
        slowPeriod: 3,
      }).success,
    ).toBe(false);
    expect(
      smaCrossoverFactory.configSchema.safeParse({
        kind: "sma-crossover",
        fastPeriod: 0,
        slowPeriod: 3,
      }).success,
    ).toBe(false);
  });

  it("accepts a valid config", () => {
    expect(
      smaCrossoverFactory.configSchema.safeParse({
        kind: "sma-crossover",
        fastPeriod: 2,
        slowPeriod: 3,
      }).success,
    ).toBe(true);
  });
});

describe("smaCrossoverStrategy", () => {
  it("buys when the fast SMA crosses above the slow SMA on the latest bar", () => {
    const series = candles(["100", "102", "104", "103", "102", "130"]);

    const signal = strategy().evaluate(series);

    expect(signal.direction).toBe("buy");
    expect(signal.symbol).toBe("BTCUSDT");
    expect(signal.strategyId).toBe("sma-crossover");
    expect(signal.timestamp).toBe(series[series.length - 1].timestamp);
    expect(signal.reason).toContain("crossed above");
    expect(signal.reason).toContain("2");
    expect(signal.reason).toContain("3");
  });

  it("sells when the fast SMA crosses below the slow SMA on the latest bar", () => {
    const series = candles(["130", "128", "126", "127", "128", "100"]);

    const signal = strategy().evaluate(series);

    expect(signal.direction).toBe("sell");
    expect(signal.reason).toContain("crossed below");
  });

  it("holds when there is no crossover on the latest bar", () => {
    const series = candles(["100", "100", "100", "100", "100", "100"]);

    const signal = strategy().evaluate(series);

    expect(signal.direction).toBe("hold");
    expect(signal.reason).toContain("no SMA");
  });

  it("holds with insufficient data", () => {
    const signal = strategy().evaluate(candles(["1", "2", "3"]));

    expect(signal.direction).toBe("hold");
    expect(signal.reason).toContain("insufficient data");
  });

  it("throws when given no candles", () => {
    expect(() => strategy().evaluate([])).toThrow(/empty candle input/);
  });

  it("is deterministic across repeated evaluations", () => {
    const series = candles(["100", "102", "104", "103", "102", "130"]);
    const first = strategy().evaluate(series);
    const second = strategy().evaluate(series);
    expect(second).toEqual(first);
  });
});
