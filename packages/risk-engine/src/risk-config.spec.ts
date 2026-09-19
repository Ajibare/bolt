import { describe, expect, it } from "vitest";
import { constrainRiskConfig, validateRiskConfig, DEFAULT_RISK_CONFIG } from "./risk-config.js";
import { InvalidRiskConfigError } from "./errors.js";

describe("validateRiskConfig", () => {
  it("applies defaults for omitted limits", () => {
    const config = validateRiskConfig({});
    expect(config.maxRiskPerTrade).toBe(DEFAULT_RISK_CONFIG.maxRiskPerTrade);
    expect(config.maxPositionSize).toBe(DEFAULT_RISK_CONFIG.maxPositionSize);
    expect(config.maxOpenPositions).toBe(DEFAULT_RISK_CONFIG.maxOpenPositions);
    expect(config.allowedSymbols).toBeNull();
    expect(config.allowedSides).toBeNull();
    expect(config.tradingSession).toBeNull();
  });

  it("rejects undefined config", () => {
    expect(() => validateRiskConfig(undefined)).toThrow(InvalidRiskConfigError);
  });

  it("requires fractions to be in (0, 1]", () => {
    for (const bad of ["0", "-0.5", "1.01"]) {
      expect(() => validateRiskConfig({ maxRiskPerTrade: bad })).toThrow(InvalidRiskConfigError);
    }
  });

  it("rejects negative maxOpenPositions and non-integers", () => {
    expect(() => validateRiskConfig({ maxOpenPositions: -1 })).toThrow(InvalidRiskConfigError);
    expect(() => validateRiskConfig({ maxOpenPositions: 1.5 })).toThrow(InvalidRiskConfigError);
  });

  it("normalizes allowed symbols and sides", () => {
    const config = validateRiskConfig({
      allowedSymbols: ["BTCUSDT", "ETHUSDT"],
      allowedSides: ["buy"],
    });
    expect(config.allowedSymbols).toEqual(["BTCUSDT", "ETHUSDT"]);
    expect(config.allowedSides).toEqual(["buy"]);
  });

  it("rejects invalid sides and empty arrays", () => {
    expect(() => validateRiskConfig({ allowedSides: ["up"] as never })).toThrow(
      InvalidRiskConfigError,
    );
    expect(() => validateRiskConfig({ allowedSides: [] })).toThrow(InvalidRiskConfigError);
    expect(() => validateRiskConfig({ allowedSymbols: [] })).toThrow(InvalidRiskConfigError);
  });

  it("validates trading session minutes", () => {
    expect(() =>
      validateRiskConfig({ tradingSession: { startMinutes: -1, endMinutes: 30 } }),
    ).toThrow(InvalidRiskConfigError);
    expect(() =>
      validateRiskConfig({ tradingSession: { startMinutes: 0, endMinutes: 1440 } }),
    ).toThrow(InvalidRiskConfigError);
    expect(
      validateRiskConfig({ tradingSession: { startMinutes: 600, endMinutes: 1200 } })
        .tradingSession,
    ).toEqual({ startMinutes: 600, endMinutes: 1200 });
  });
});

const CEILING = validateRiskConfig({
  maxRiskPerTrade: "0.02",
  maxPositionSize: "0.2",
  maxExposure: "0.6",
  maxOpenPositions: 5,
  maxDailyLoss: "0.1",
  maxDrawdown: "0.3",
  requireStopLoss: true,
  requireTakeProfit: false,
  maxStopLossDistance: "0.2",
  maxTakeProfitDistance: "0.8",
  allowedSymbols: ["BTCUSDT", "ETHUSDT"],
  allowedSides: ["buy"],
  tradingSession: { startMinutes: 600, endMinutes: 1200 },
});

describe("constrainRiskConfig", () => {
  it("returns the ceiling when no request is supplied", () => {
    expect(constrainRiskConfig(undefined, CEILING)).toEqual(CEILING);
  });

  it("clamps looser limits down to the ceiling", () => {
    const constrained = constrainRiskConfig(
      {
        maxRiskPerTrade: "0.5",
        maxPositionSize: "0.9",
        maxExposure: "0.9",
        maxOpenPositions: 50,
        maxDailyLoss: "0.9",
        maxDrawdown: "0.9",
        maxStopLossDistance: "0.9",
        maxTakeProfitDistance: "1",
      },
      CEILING,
    );

    expect(constrained.maxRiskPerTrade).toBe(CEILING.maxRiskPerTrade);
    expect(constrained.maxPositionSize).toBe(CEILING.maxPositionSize);
    expect(constrained.maxExposure).toBe(CEILING.maxExposure);
    expect(constrained.maxOpenPositions).toBe(CEILING.maxOpenPositions);
    expect(constrained.maxDailyLoss).toBe(CEILING.maxDailyLoss);
    expect(constrained.maxDrawdown).toBe(CEILING.maxDrawdown);
    expect(constrained.maxStopLossDistance).toBe(CEILING.maxStopLossDistance);
    expect(constrained.maxTakeProfitDistance).toBe(CEILING.maxTakeProfitDistance);
  });

  it("keeps requests that are stricter than the ceiling", () => {
    const constrained = constrainRiskConfig(
      { maxRiskPerTrade: "0.01", maxOpenPositions: 2 },
      CEILING,
    );

    expect(constrained.maxRiskPerTrade).toBe("0.01");
    expect(constrained.maxOpenPositions).toBe(2);
  });

  it("cannot disable a server-required stop loss", () => {
    const constrained = constrainRiskConfig(
      { requireStopLoss: false, requireTakeProfit: true },
      CEILING,
    );

    expect(constrained.requireStopLoss).toBe(true);
    expect(constrained.requireTakeProfit).toBe(true);
  });

  it("intersects symbol and side allow-lists", () => {
    const constrained = constrainRiskConfig(
      { allowedSymbols: ["ETHUSDT", "SOLUSDT"], allowedSides: ["buy"] },
      CEILING,
    );

    expect(constrained.allowedSymbols).toEqual(["ETHUSDT"]);
    expect(constrained.allowedSides).toEqual(["buy"]);
    expect(() => constrainRiskConfig({ allowedSymbols: ["SOLUSDT"] }, CEILING)).toThrow(
      InvalidRiskConfigError,
    );
  });

  it("accepts a trading window inside the ceiling and rejects one outside", () => {
    expect(
      constrainRiskConfig({ tradingSession: { startMinutes: 700, endMinutes: 800 } }, CEILING)
        .tradingSession,
    ).toEqual({ startMinutes: 700, endMinutes: 800 });

    expect(() =>
      constrainRiskConfig({ tradingSession: { startMinutes: 500, endMinutes: 800 } }, CEILING),
    ).toThrow(InvalidRiskConfigError);
  });
});
