import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, transition } from "./order-lifecycle.js";
import { InvalidStateTransitionError } from "../errors.js";
import { realizedPnlOnClose, averageUpEntry, assertSameSymbol } from "./paper-math.js";

describe("order lifecycle", () => {
  it("follows the happy path to FILLED", () => {
    let status = transition("CREATED", "SUBMITTED");
    status = transition(status, "ACCEPTED");
    status = transition(status, "PARTIALLY_FILLED");
    status = transition(status, "FILLED");
    expect(status).toBe("FILLED");
  });

  it("rejects invalid transitions", () => {
    expect(() => transition("CREATED", "FILLED")).toThrow(InvalidStateTransitionError);
    expect(() => transition("FILLED", "CANCELLED")).toThrow(InvalidStateTransitionError);
  });

  it("allows terminal via rejection and cancellation", () => {
    expect(canTransition("SUBMITTED", "REJECTED")).toBe(true);
    expect(canTransition("ACCEPTED", "CANCELLED")).toBe(true);
    expect(isTerminal("FILLED")).toBe(true);
    expect(isTerminal("CANCELLED")).toBe(true);
    expect(isTerminal("REJECTED")).toBe(true);
    expect(isTerminal("ACCEPTED")).toBe(false);
  });
});

describe("realizedPnlOnClose", () => {
  it("computes profit on a winning close", () => {
    expect(
      realizedPnlOnClose({
        quantity: "1",
        avgEntryPrice: "100",
        exitPrice: "110",
        exitFee: "0.11",
      }),
    ).toBe("9.89");
  });

  it("computes loss on a losing close", () => {
    expect(
      realizedPnlOnClose({ quantity: "2", avgEntryPrice: "100", exitPrice: "90", exitFee: "0.18" }),
    ).toBe("-20.18");
  });
});

describe("averageUpEntry", () => {
  it("returns the add price when flat", () => {
    expect(
      averageUpEntry({
        existingQuantity: "0",
        existingAvgEntry: "0",
        addQuantity: "2",
        addPrice: "110",
      }),
    ).toBe("110");
  });

  it("blends entries on add", () => {
    expect(
      averageUpEntry({
        existingQuantity: "1",
        existingAvgEntry: "100",
        addQuantity: "1",
        addPrice: "120",
      }),
    ).toBe("110");
  });
});

describe("assertSameSymbol", () => {
  it("throws on a symbol mismatch", () => {
    expect(() => assertSameSymbol("BTCUSDT", "ETHUSDT")).toThrow(/Symbol mismatch/);
    expect(() => assertSameSymbol("BTCUSDT", "BTCUSDT")).not.toThrow();
  });
});
