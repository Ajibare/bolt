import type { Candle, SupportedSymbol } from "@trading-bolt/shared";
import { describe, expect, it } from "vitest";

import {
  createStrategy,
  getStrategyFactory,
  isRegisteredStrategy,
  listStrategies,
  RSI_MEAN_REVERSION_ID,
  SMA_CROSSOVER_ID,
  InvalidStrategyConfigError,
  StrategyNotFoundError,
} from "./index.js";

function candles(closes: string[]): Candle[] {
  const start = 1_700_000_000_000;
  const symbol: SupportedSymbol = "BTCUSDT";
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

describe("strategy registry (built-in registration)", () => {
  it("registers the built-in strategy factories on import", () => {
    const ids = listStrategies().map((factory) => factory.id);
    expect(ids).toContain(SMA_CROSSOVER_ID);
    expect(ids).toContain(RSI_MEAN_REVERSION_ID);
  });

  it("reports registration status", () => {
    expect(isRegisteredStrategy(SMA_CROSSOVER_ID)).toBe(true);
    expect(isRegisteredStrategy(RSI_MEAN_REVERSION_ID)).toBe(true);
    expect(isRegisteredStrategy("unknown-strategy")).toBe(false);
  });

  it("returns a factory by id", () => {
    expect(getStrategyFactory(SMA_CROSSOVER_ID)?.id).toBe(SMA_CROSSOVER_ID);
    expect(getStrategyFactory("unknown-strategy")).toBeUndefined();
  });

  it("creates a working strategy via the registry", () => {
    const strategy = createStrategy(SMA_CROSSOVER_ID, {
      kind: SMA_CROSSOVER_ID,
      fastPeriod: 2,
      slowPeriod: 3,
    });

    const signal = strategy.evaluate(candles(["100", "102", "104", "103", "102", "130"]));

    expect(signal.direction).toBe("buy");
    expect(signal.strategyId).toBe(SMA_CROSSOVER_ID);
  });

  it("throws a typed error for an unknown strategy id", () => {
    expect(() => createStrategy("nope", {})).toThrow(StrategyNotFoundError);
  });

  it("throws a typed error for an invalid config", () => {
    expect(() =>
      createStrategy(SMA_CROSSOVER_ID, {
        kind: SMA_CROSSOVER_ID,
        fastPeriod: 5,
        slowPeriod: 4,
      }),
    ).toThrow(InvalidStrategyConfigError);
  });
});
