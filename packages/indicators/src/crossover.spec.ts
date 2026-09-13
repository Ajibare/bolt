import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { crossovers } from "./crossover.js";

function d(value: string): Decimal {
  return new Decimal(value);
}

describe("crossovers", () => {
  it("returns an empty array when either input is empty", () => {
    expect(crossovers([], [d("1")])).toEqual([]);
    expect(crossovers([d("1")], [])).toEqual([]);
  });

  it("keeps the first position null", () => {
    expect(crossovers([d("1"), d("2")], [d("2"), d("1")])[0]).toBeNull();
  });

  it("detects a bullish crossover", () => {
    const fast = [d("1"), d("2"), d("3")];
    const slow = [d("3"), d("1.8"), d("1")];
    expect(crossovers(fast, slow)).toEqual([null, "bullish", null]);
  });

  it("detects a bearish crossover", () => {
    const fast = [d("3"), d("1.5"), d("1")];
    const slow = [d("1"), d("1.6"), d("3")];
    expect(crossovers(fast, slow)).toEqual([null, "bearish", null]);
  });

  it("does not signal when the fast series stays above or below", () => {
    const fast = [d("1"), d("2"), d("2")];
    const slow = [d("0"), d("1"), d("1")];
    expect(crossovers(fast, slow)).toEqual([null, null, null]);
  });

  it("skips warm-up nulls without emitting false signals", () => {
    const fast: (Decimal | null)[] = [null, null, d("2"), d("3")];
    const slow: (Decimal | null)[] = [d("1"), d("1.5"), d("1.8"), d("1")];
    expect(crossovers(fast, slow)).toEqual([null, null, null, null]);
  });

  it("treats null in the middle as a gap without emitting", () => {
    const fast: (Decimal | null)[] = [d("1"), null, d("3")];
    const slow: (Decimal | null)[] = [d("2"), d("0"), d("2")];
    expect(crossovers(fast, slow)).toEqual([null, null, null]);
  });

  it("compares decimals exactly", () => {
    const fast = [d("0.1"), d("0.2")];
    const slow = [d("0.3"), d("0.1")];
    expect(crossovers(fast, slow)).toEqual([null, "bullish"]);
  });
});
