import { describe, expect, it } from "vitest";
import { sizePosition } from "./position-sizing.js";
import { InvalidOrderRiskError } from "./errors.js";

describe("sizePosition", () => {
  it("sizes a long position so the stop distance equals the allowed loss", () => {
    // equity 10000, risk 1% -> allowed loss 100; stop 5% away (100 -> 95)
    const result = sizePosition({
      side: "buy",
      equity: "10000",
      riskFraction: "0.01",
      entryPrice: "100",
      stopLoss: "95",
    });
    expect(result.allowedLoss).toBe("100");
    expect(result.quantity).toBe("20");
    expect(result.notional).toBe("2000");
  });

  it("scales quantity with stop distance (tighter stop -> larger size)", () => {
    const short = sizePosition({
      side: "buy",
      equity: "10000",
      riskFraction: "0.01",
      entryPrice: "100",
      stopLoss: "99.5",
    });
    expect(short.quantity).toBe("200");
    expect(short.notional).toBe("20000");

    const wide = sizePosition({
      side: "buy",
      equity: "10000",
      riskFraction: "0.01",
      entryPrice: "100",
      stopLoss: "90",
    });
    expect(wide.quantity).toBe("10");
  });

  it("supports short positions with stop above entry", () => {
    const result = sizePosition({
      side: "sell",
      equity: "5000",
      riskFraction: "0.02",
      entryPrice: "50",
      stopLoss: "55",
    });
    expect(result.allowedLoss).toBe("100");
    expect(result.quantity).toBe("20");
    expect(result.notional).toBe("1000");
  });

  it("rejects a long position with stop at or above entry", () => {
    expect(() =>
      sizePosition({
        side: "buy",
        equity: "10000",
        riskFraction: "0.01",
        entryPrice: "100",
        stopLoss: "100",
      }),
    ).toThrow(InvalidOrderRiskError);

    expect(() =>
      sizePosition({
        side: "buy",
        equity: "10000",
        riskFraction: "0.01",
        entryPrice: "100",
        stopLoss: "101",
      }),
    ).toThrow(InvalidOrderRiskError);
  });

  it("rejects a short position with stop at or below entry", () => {
    expect(() =>
      sizePosition({
        side: "sell",
        equity: "10000",
        riskFraction: "0.01",
        entryPrice: "100",
        stopLoss: "100",
      }),
    ).toThrow(InvalidOrderRiskError);

    expect(() =>
      sizePosition({
        side: "sell",
        equity: "10000",
        riskFraction: "0.01",
        entryPrice: "100",
        stopLoss: "99",
      }),
    ).toThrow(InvalidOrderRiskError);
  });

  it("rejects non-positive equity", () => {
    expect(() =>
      sizePosition({
        side: "buy",
        equity: "0",
        riskFraction: "0.01",
        entryPrice: "100",
        stopLoss: "95",
      }),
    ).toThrow(InvalidOrderRiskError);
  });

  it("rejects risk fractions outside (0, 1]", () => {
    for (const bad of ["0", "-0.01", "1.5"]) {
      expect(() =>
        sizePosition({
          side: "buy",
          equity: "10000",
          riskFraction: bad,
          entryPrice: "100",
          stopLoss: "95",
        }),
      ).toThrow(InvalidOrderRiskError);
    }
  });

  it("is precise with decimal strings", () => {
    const result = sizePosition({
      side: "buy",
      equity: "123.45",
      riskFraction: "0.01",
      entryPrice: "99.99",
      stopLoss: "98.5",
    });
    // allowedLoss 1.2345 / distance 1.49
    expect(result.quantity).toBe("0.82852348993288590604");
    expect(result.notional).toBe("82.844063758389261745");
  });
});
