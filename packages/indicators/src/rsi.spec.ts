import { describe, expect, it } from "vitest";

import { rsi } from "./rsi.js";

function format(value: import("decimal.js").Decimal | null, digits: number): string {
  return value === null ? "null" : value.toFixed(digits);
}

function expectSeries(
  actual: Array<import("decimal.js").Decimal | null>,
  expected: string[],
  digits = 6,
): void {
  expect(actual.map((value) => format(value, digits))).toEqual(expected);
}

describe("rsi", () => {
  it("throws for non-positive or non-integer periods", () => {
    expect(() => rsi(["1"], 0)).toThrow(/positive integer/);
    expect(() => rsi(["1"], -1)).toThrow(/positive integer/);
    expect(() => rsi(["1"], 1.5)).toThrow(/positive integer/);
  });

  it("returns an empty series for empty input", () => {
    expectSeries(rsi([], 2), []);
  });

  it("returns nulls when there are insufficient values", () => {
    expectSeries(rsi(["1", "2", "3"], 3), ["null", "null", "null"]);
  });

  it("is 100 for a strictly rising series", () => {
    expectSeries(rsi(["1", "2", "3", "4"], 2), ["null", "null", "100.000000", "100.000000"]);
  });

  it("is 0 for a strictly falling series", () => {
    expectSeries(rsi(["4", "3", "2", "1"], 2), ["null", "null", "0.000000", "0.000000"]);
  });

  it("tracks alternating gains and losses for period 1", () => {
    expectSeries(rsi(["10", "12", "9", "11"], 1), ["null", "100.000000", "0.000000", "100.000000"]);
  });

  it("computes a rolling Wilder RSI for mixed changes", () => {
    expectSeries(rsi(["1", "2", "1", "2"], 2), ["null", "null", "50.000000", "75.000000"]);
  });

  it("does not divide by zero on flat segments", () => {
    expectSeries(rsi(["1", "1", "1", "1"], 1), ["null", "100.000000", "100.000000", "100.000000"]);
  });

  it("handles decimal-string inputs exactly", () => {
    // Changes alternate +0.1 / -0.1 / +0.1, so the same RSI profile as the
    // integer case but computed from string decimals.
    expectSeries(rsi(["0.10", "0.20", "0.10", "0.20"], 2), [
      "null",
      "null",
      "50.000000",
      "75.000000",
    ]);
  });
});
