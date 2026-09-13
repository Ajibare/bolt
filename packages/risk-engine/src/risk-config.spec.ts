import { describe, expect, it } from "vitest";
import { validateRiskConfig, DEFAULT_RISK_CONFIG } from "./risk-config.js";
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
