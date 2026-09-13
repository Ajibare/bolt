import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { ema, sma } from "./moving-average.js";

function format(value: Decimal | null, digits: number): string {
  return value === null ? "null" : value.toFixed(digits);
}

function expectSeries(actual: Array<Decimal | null>, expected: string[], digits = 6): void {
  expect(actual.map((value) => format(value, digits))).toEqual(expected);
}

describe("sma", () => {
  it("throws for non-positive or non-integer periods", () => {
    expect(() => sma(["1"], 0)).toThrow(/positive integer/);
    expect(() => sma(["1"], -2)).toThrow(/positive integer/);
    expect(() => sma(["1"], 1.5)).toThrow(/positive integer/);
  });

  it("returns an empty series for empty input", () => {
    expectSeries(sma([], 2), []);
  });

  it("returns nulls when there are fewer values than the period", () => {
    expectSeries(sma(["1", "2"], 3), ["null", "null"]);
  });

  it("computes exact averages without float drift", () => {
    expectSeries(sma(["0.1", "0.2", "0.3", "0.4"], 2), [
      "null",
      "0.150000",
      "0.250000",
      "0.350000",
    ]);
  });

  it("aligns warm-up positions as null then produces values", () => {
    expectSeries(sma(["1", "2", "3", "4", "5"], 3), [
      "null",
      "null",
      "2.000000",
      "3.000000",
      "4.000000",
    ]);
  });

  it("accepts numeric input", () => {
    expectSeries(sma([1, 2, 3, 4], 2), ["null", "1.500000", "2.500000", "3.500000"]);
  });
});

describe("ema", () => {
  it("throws for invalid periods", () => {
    expect(() => ema(["1"], 0)).toThrow(/positive integer/);
    expect(() => ema(["1"], 2.5)).toThrow(/positive integer/);
  });

  it("returns nulls when there are fewer values than the period", () => {
    expectSeries(ema(["1", "2"], 3), ["null", "null"]);
  });

  it("period 1 mirrors the input", () => {
    expectSeries(ema(["1", "2", "3"], 1), ["1.000000", "2.000000", "3.000000"]);
  });

  it("seeds with the SMA and smooths with multiplier 2/(period+1)", () => {
    expectSeries(ema(["1", "2", "3", "4", "5"], 3), [
      "null",
      "null",
      "2.000000",
      "3.000000",
      "4.000000",
    ]);
  });

  it("produces exact values for a period-2 series", () => {
    expectSeries(ema(["1", "2", "3", "4"], 2), ["null", "1.500000", "2.500000", "3.500000"]);
  });

  it("preserves decimal precision in smoothing", () => {
    expectSeries(ema(["0.1", "0.2", "0.3", "0.4"], 2), [
      "null",
      "0.150000",
      "0.250000",
      "0.350000",
    ]);
  });
});

describe("value semantics", () => {
  it("exposes Decimal values that support exact comparisons", () => {
    const series = sma(["0.1", "0.2", "0.3"], 2);
    expect(series[1]).toBeInstanceOf(Decimal);
    expect(series[1]?.eq(new Decimal("0.15"))).toBe(true);
  });
});
