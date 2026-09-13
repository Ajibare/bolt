import { describe, expect, it } from "vitest";
import { evaluatePaperOrder, rejectOrder, ensureValidOrder } from "./paper-execution.js";
import { InvalidOrderRequestError } from "../errors.js";
import type { PaperOrderState } from "./types.js";

const state = (freeCash = "10000", heldQty = "0") => ({
  freeCash,
  heldQuantity:
    heldQty === "0" ? null : { symbol: "BTCUSDT", quantity: heldQty, avgEntryPrice: "100" },
});
const oracle = (price: string, symbol = "BTCUSDT") => ({ symbol, price, timestamp: 1 });

function order(overrides: Partial<PaperOrderState> = {}): PaperOrderState {
  return {
    id: "o1",
    clientOrderId: "c1",
    side: "buy",
    type: "market",
    symbol: "BTCUSDT",
    quantity: "1",
    feeRate: "0",
    slippage: "0",
    status: "SUBMITTED",
    filledQuantity: "0",
    avgFillPrice: null,
    fees: "0",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

describe("evaluatePaperOrder", () => {
  it("fills a market buy at the oracle price", () => {
    const result = evaluatePaperOrder(state(), order(), oracle("100"));
    expect(result.status).toBe("FILLED");
    expect(result.fillPrice).toBe("100");
    expect(result.filledQuantity).toBe("1");
  });

  it("applies slippage to a market buy", () => {
    const result = evaluatePaperOrder(state(), order({ slippage: "0.02" }), oracle("100"));
    expect(result.fillPrice).toBe("102");
  });

  it("applies fees to a market buy", () => {
    const result = evaluatePaperOrder(
      state(),
      order({ feeRate: "0.001", slippage: "0.01", quantity: "2" }),
      oracle("100"),
    );
    // fee = fillPrice(101) * 2 * 0.001
    expect(result.fee).toBe("0.202");
    expect(result.fillPrice).toBe("101");
  });

  it("rests a buy limit above the market", () => {
    const result = evaluatePaperOrder(state(), order({ type: "limit", price: "90" }), oracle("95"));
    expect(result.status).toBe("OPEN");
  });

  it("fills a buy limit when the market trades through", () => {
    const result = evaluatePaperOrder(state(), order({ type: "limit", price: "90" }), oracle("89"));
    expect(result.status).toBe("FILLED");
    expect(result.fillPrice).toBe("90");
  });

  it("rejects buys that exceed free cash including fee", () => {
    const result = evaluatePaperOrder(state("100"), order({ quantity: "2" }), oracle("100"));
    expect(result.status).toBe("REJECTED");
    expect(result.reason).toBe("Insufficient buying power");
  });

  it("rejects selling more than held", () => {
    const result = evaluatePaperOrder(
      state("10000", "1"),
      order({ side: "sell", quantity: "2" }),
      oracle("110"),
    );
    expect(result.status).toBe("REJECTED");
    expect(result.reason).toBe("Insufficient position to sell");
  });

  it("sells held quantity at the oracle price", () => {
    const result = evaluatePaperOrder(
      state("10000", "1"),
      order({ side: "sell", quantity: "1" }),
      oracle("110"),
    );
    expect(result.status).toBe("FILLED");
    expect(result.fillPrice).toBe("110");
  });

  it("fails when no oracle price is available", () => {
    const result = evaluatePaperOrder(state(), order(), oracle("100", "OTHERUSDT"));
    expect(result.status).toBe("FAILED");
    expect(result.reason).toBe("No market price available");
  });

  it("rejectOrder produces a deterministic rejection", () => {
    expect(rejectOrder("spam guard")).toMatchObject({
      status: "REJECTED",
      filledQuantity: "0",
      fee: "0",
      reason: "spam guard",
    });
  });
});

describe("ensureValidOrder", () => {
  it("rejects non-positive quantity", () => {
    expect(() => ensureValidOrder(order({ quantity: "0" }))).toThrow(InvalidOrderRequestError);
  });

  it("rejects limit orders without a positive price", () => {
    expect(() => ensureValidOrder(order({ type: "limit", price: "0" }))).toThrow(
      InvalidOrderRequestError,
    );
  });

  it("rejects negative feeRate or slippage", () => {
    expect(() => ensureValidOrder(order({ feeRate: "-0.1" }))).toThrow(InvalidOrderRequestError);
    expect(() => ensureValidOrder(order({ slippage: "-0.1" }))).toThrow(InvalidOrderRequestError);
  });

  it("accepts a valid market order", () => {
    expect(() => ensureValidOrder(order())).not.toThrow();
  });
});
