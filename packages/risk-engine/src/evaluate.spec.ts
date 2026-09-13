import { describe, expect, it } from "vitest";
import { evaluateOrder } from "./evaluate.js";
import type { OrderProposal, RiskAccountState } from "./types.js";

const BASE_CONFIG = {
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
  allowedSymbols: null,
  allowedSides: null,
  tradingSession: null,
};

const BASE_ACCOUNT: RiskAccountState = {
  equity: "10000",
  realizedPnlToday: "0",
  openPositions: 3,
  currentExposure: "0.3",
  currentDrawdown: "0.05",
};

function buyProposal(overrides: Partial<OrderProposal> = {}): OrderProposal {
  return {
    symbol: "BTCUSDT",
    side: "buy",
    quantity: "10",
    price: "100",
    stopLoss: "95",
    ...overrides,
  };
}

describe("evaluateOrder", () => {
  it("approves a compliant order", () => {
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: BASE_ACCOUNT,
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(true);
    expect(decision.results.every((r) => r.passed)).toBe(true);
    expect(decision.reasons).toEqual([]);
  });

  it("rejects orders outside the allowed symbol list", () => {
    const decision = evaluateOrder({
      proposal: buyProposal({ symbol: "DOGEUSDT" }),
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, allowedSymbols: ["BTCUSDT"] },
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Symbol"))).toBe(true);
  });

  it("rejects disallowed sides", () => {
    const decision = evaluateOrder({
      proposal: buyProposal({ side: "sell", stopLoss: "105" }),
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, allowedSides: ["buy"] },
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Side"))).toBe(true);
  });

  it("rejects outside trading session", () => {
    const now = new Date("2026-01-01T00:00:00Z").getTime(); // 00:00 UTC
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, tradingSession: { startMinutes: 600, endMinutes: 1200 } }, // 10:00-20:00 UTC
      nowMs: now,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("session"))).toBe(true);
  });

  it("approves within trading session", () => {
    const now = new Date("2026-01-01T12:00:00Z").getTime();
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, tradingSession: { startMinutes: 600, endMinutes: 1200 } },
      nowMs: now,
    });
    expect(decision.approved).toBe(true);
  });

  it("rejects when stop-loss is required but missing", () => {
    const decision = evaluateOrder({
      proposal: buyProposal({ stopLoss: undefined }),
      account: BASE_ACCOUNT,
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Stop-loss"))).toBe(true);
  });

  it("rejects when take-profit is required but missing", () => {
    const decision = evaluateOrder({
      proposal: buyProposal({ takeProfit: undefined }),
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, requireTakeProfit: true },
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Take-profit"))).toBe(true);
  });

  it("rejects stop-loss beyond max distance", () => {
    const decision = evaluateOrder({
      proposal: buyProposal({ stopLoss: "80" }), // 20% away, max 10%
      account: BASE_ACCOUNT,
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Stop-loss distance"))).toBe(true);
  });

  it("rejects take-profit beyond max distance", () => {
    const decision = evaluateOrder({
      proposal: buyProposal({ takeProfit: "500" }), // 400% away, max 100%
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, requireTakeProfit: true },
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Take-profit distance"))).toBe(true);
  });

  it("rejects orders above max risk per trade", () => {
    // quantity 10, price 100, stop 95 -> risk = 10*5 = 50 > 1% of 10000 (100)
    const decision = evaluateOrder({
      proposal: buyProposal({ quantity: "30" }), // risk 150
      account: BASE_ACCOUNT,
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Risk per trade"))).toBe(true);
  });

  it("rejects orders above max position size", () => {
    // notional 10*100=1000 > 20% of 10000 (2000)? 1000 < 2000 -> ok, so raise qty
    const decision = evaluateOrder({
      proposal: buyProposal({ quantity: "50" }), // notional 5000 > 2000
      account: BASE_ACCOUNT,
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Notional"))).toBe(true);
  });

  it("rejects orders pushing exposure over the limit", () => {
    // current 30%, notional 1000 -> equity 10000 = 10% more => 40% < 50% ok
    // raise config to 0.35 so 40% exceeds
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, maxExposure: "0.35" },
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Exposure"))).toBe(true);
  });

  it("rejects when at max open positions", () => {
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: { ...BASE_ACCOUNT, openPositions: 5 },
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Open positions"))).toBe(true);
  });

  it("rejects when daily loss limit is breached", () => {
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: { ...BASE_ACCOUNT, realizedPnlToday: "-700" }, // 7% > 5% limit
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Daily loss"))).toBe(true);
  });

  it("rejects when drawdown limit is breached", () => {
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: { ...BASE_ACCOUNT, currentDrawdown: "0.25" },
      config: BASE_CONFIG,
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Drawdown"))).toBe(true);
  });

  it("rejects when a circuit breaker is open", () => {
    const decision = evaluateOrder({
      proposal: buyProposal(),
      account: BASE_ACCOUNT,
      config: BASE_CONFIG,
      openBreakers: ["global"],
    });
    expect(decision.approved).toBe(false);
    expect(decision.reasons.some((r) => r.includes("Circuit breaker"))).toBe(true);
  });

  it("lists every failing rule in the decision", () => {
    const decision = evaluateOrder({
      proposal: buyProposal({ symbol: "DOGEUSDT", quantity: "500" }), // symbol + notional fail
      account: BASE_ACCOUNT,
      config: { ...BASE_CONFIG, allowedSymbols: ["BTCUSDT"] },
    });
    expect(decision.approved).toBe(false);
    const failedRules = decision.results.filter((r) => !r.passed).map((r) => r.rule);
    expect(failedRules).toContain("symbol-allowed");
    expect(failedRules).toContain("max-risk-per-trade");
    expect(failedRules).toContain("max-position-size");
  });

  it("fails closed when config is missing rather than approving", () => {
    expect(() =>
      evaluateOrder({
        proposal: buyProposal(),
        account: BASE_ACCOUNT,
        config: undefined,
      }),
    ).toThrow();
  });

  it("is deterministic across repeated evaluations", () => {
    const input = { proposal: buyProposal(), account: BASE_ACCOUNT, config: BASE_CONFIG };
    const a = evaluateOrder(input);
    const b = evaluateOrder(input);
    expect(a).toEqual(b);
  });

  describe("reduce-only orders", () => {
    const heldLong = (quantity = "2"): RiskAccountState => ({
      ...BASE_ACCOUNT,
      heldPosition: { quantity, side: "long" },
    });

    it("approves a reduce-only sell within the held position", () => {
      const decision = evaluateOrder({
        proposal: buyProposal({ side: "sell", quantity: "1", reduceOnly: true }),
        account: heldLong(),
        config: BASE_CONFIG,
      });
      expect(decision.approved).toBe(true);
      expect(decision.results.every((r) => r.rule === "reduce-only")).toBe(true);
    });

    it("approves a reduce-only buy that closes a short", () => {
      const decision = evaluateOrder({
        proposal: buyProposal({ side: "buy", quantity: "1", reduceOnly: true }),
        account: { ...BASE_ACCOUNT, heldPosition: { quantity: "1", side: "short" } },
        config: BASE_CONFIG,
      });
      expect(decision.approved).toBe(true);
    });

    it("rejects a reduce-only order when the symbol is flat", () => {
      const decision = evaluateOrder({
        proposal: buyProposal({ side: "sell", quantity: "1", reduceOnly: true }),
        account: BASE_ACCOUNT,
        config: BASE_CONFIG,
      });
      expect(decision.approved).toBe(false);
      expect(decision.reasons.some((r) => r.startsWith("Reduce-only"))).toBe(true);
    });

    it("rejects a reduce-only order that would exceed the held quantity", () => {
      const decision = evaluateOrder({
        proposal: buyProposal({ side: "sell", quantity: "3", reduceOnly: true }),
        account: heldLong("2"),
        config: BASE_CONFIG,
      });
      expect(decision.approved).toBe(false);
      expect(decision.reasons.some((r) => r.includes("exceeds held quantity"))).toBe(true);
    });

    it("rejects a reduce-only order on the non-reducing side", () => {
      const decision = evaluateOrder({
        proposal: buyProposal({ side: "buy", quantity: "1", reduceOnly: true }),
        account: heldLong("2"),
        config: BASE_CONFIG,
      });
      expect(decision.approved).toBe(false);
    });

    it("is never blocked by opening, capital or breaker rules", () => {
      const decision = evaluateOrder({
        proposal: buyProposal({ side: "sell", quantity: "1", reduceOnly: true }),
        account: heldLong("2"),
        config: {
          ...BASE_CONFIG,
          maxOpenPositions: 0,
          maxPositionSize: "0.0000001",
          maxDailyLoss: "0.05",
          maxDrawdown: "0.2",
        },
        openBreakers: ["account"],
      });
      expect(decision.approved).toBe(true);
    });
  });
});
