import { describe, expect, it } from "vitest";

import { SIGNAL_DIRECTIONS, isSignalDirection, SIGNAL_SOURCES } from "../types/signal.js";
import type { Signal } from "../types/signal.js";

describe("SIGNAL_DIRECTIONS", () => {
  it("contains buy, sell, hold", () => {
    expect(SIGNAL_DIRECTIONS).toEqual(["buy", "sell", "hold"]);
  });
});

describe("isSignalDirection", () => {
  it("accepts valid directions", () => {
    expect(isSignalDirection("buy")).toBe(true);
    expect(isSignalDirection("sell")).toBe(true);
    expect(isSignalDirection("hold")).toBe(true);
  });

  it("rejects invalid values", () => {
    expect(isSignalDirection("BUY")).toBe(false);
    expect(isSignalDirection("exit")).toBe(false);
    expect(isSignalDirection("")).toBe(false);
  });
});

describe("SIGNAL_SOURCES", () => {
  it("contains strategy, system, manual", () => {
    expect(SIGNAL_SOURCES).toEqual(["strategy", "system", "manual"]);
  });
});

describe("Signal shape", () => {
  it("conforms to the expected interface at compile time", () => {
    const signal: Signal = {
      symbol: "BTCUSDT",
      strategyId: "sma-cross-v1",
      direction: "buy",
      reason: "fast > slow",
      timestamp: 1700000000000,
    };
    expect(signal.direction).toBe("buy");
    expect(signal.symbol).toBe("BTCUSDT");
  });
});
