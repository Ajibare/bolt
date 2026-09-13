import { describe, expect, it } from "vitest";
import { isWithinSession, utcClock } from "./session.js";
import { CircuitBreakerRegistry, evaluateBreaches } from "./circuit-breaker.js";
import type { RiskAccountState } from "./types.js";

describe("isWithinSession", () => {
  it("is within a normal window", () => {
    const session = { startMinutes: 600, endMinutes: 1200 }; // 10:00-20:00 UTC
    expect(isWithinSession(session, { minutesOfDay: 720 })).toBe(true);
    expect(isWithinSession(session, { minutesOfDay: 600 })).toBe(true);
    expect(isWithinSession(session, { minutesOfDay: 1199 })).toBe(true);
    expect(isWithinSession(session, { minutesOfDay: 1200 })).toBe(false);
    expect(isWithinSession(session, { minutesOfDay: 0 })).toBe(false);
  });

  it("wraps past midnight", () => {
    const session = { startMinutes: 1320, endMinutes: 360 }; // 22:00-06:00 UTC
    expect(isWithinSession(session, { minutesOfDay: 0 })).toBe(true);
    expect(isWithinSession(session, { minutesOfDay: 120 })).toBe(true);
    expect(isWithinSession(session, { minutesOfDay: 360 })).toBe(false);
    expect(isWithinSession(session, { minutesOfDay: 1380 })).toBe(true);
  });

  it("rejects an empty window", () => {
    expect(() =>
      isWithinSession({ startMinutes: 0, endMinutes: 0 }, { minutesOfDay: 0 }),
    ).toThrow();
  });

  it("utcClock maps epoch ms to UTC minutes of day", () => {
    const clock = utcClock(new Date("2026-01-01T12:30:00Z").getTime());
    expect(clock.minutesOfDay).toBe(750);
  });
});

describe("CircuitBreakerRegistry", () => {
  it("starts closed and trips explicitly", () => {
    const registry = new CircuitBreakerRegistry();
    expect(registry.isOpen("global")).toBe(false);
    registry.trip("global", "Daily loss limit exceeded");
    expect(registry.isOpen("global")).toBe(true);
    expect(registry.open().length).toBe(1);
    expect(registry.open()[0].reason).toContain("Daily loss");
  });

  it("does not auto-reset; reset must be explicit", () => {
    const registry = new CircuitBreakerRegistry();
    registry.trip("bot", "Broker connection failure");
    expect(registry.isOpen("bot")).toBe(true);
    registry.reset("bot");
    expect(registry.isOpen("bot")).toBe(false);
  });

  it("keeps severities independent", () => {
    const registry = new CircuitBreakerRegistry();
    registry.trip("strategy", "Repeated execution failures");
    expect(registry.isOpen("strategy")).toBe(true);
    expect(registry.isOpen("account")).toBe(false);
  });
});

describe("evaluateBreaches", () => {
  const account: RiskAccountState = {
    equity: "10000",
    realizedPnlToday: "0",
    openPositions: 0,
    currentExposure: "0",
    currentDrawdown: "0",
  };
  const config = {
    maxRiskPerTrade: "0.01",
    maxPositionSize: "0.2",
    maxExposure: "0.5",
    maxOpenPositions: 5,
    maxDailyLoss: "0.05",
    maxDrawdown: "0.2",
    requireStopLoss: true,
    requireTakeProfit: false,
    maxStopLossDistance: "0.1",
    maxTakeProfitDistance: "1",
    allowedSymbols: null as string[] | null,
    allowedSides: null as ("buy" | "sell")[] | null,
    tradingSession: null,
  };

  it("reports no breaches on a healthy account", () => {
    expect(evaluateBreaches(account, config)).toEqual([]);
  });

  it("reports daily-loss breach", () => {
    const findings = evaluateBreaches(
      { ...account, realizedPnlToday: "-1000" }, // 10% > 5%
      config,
    );
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("account");
  });

  it("reports drawdown breach", () => {
    const findings = evaluateBreaches({ ...account, currentDrawdown: "0.5" }, config);
    expect(findings.length).toBe(1);
    expect(findings[0].severity).toBe("account");
  });

  it("reports both breaches when both exceeded", () => {
    const findings = evaluateBreaches(
      { ...account, realizedPnlToday: "-1500", currentDrawdown: "0.5" },
      config,
    );
    expect(findings.length).toBe(2);
  });
});
