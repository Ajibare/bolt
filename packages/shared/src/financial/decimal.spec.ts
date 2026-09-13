import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import {
  abs,
  add,
  div,
  equals,
  format,
  isNegative,
  isZero,
  max,
  min,
  mul,
  round,
  sub,
  toDecimal,
} from "./decimal.js";

describe("decimal financial utilities", () => {
  it("adds without floating point artifacts", () => {
    expect(add(0.1, 0.2).toNumber()).toBe(0.3);
    expect(add("0.1", "0.2").toString()).toBe("0.3");
  });

  it("subtracts without floating point artifacts", () => {
    expect(sub(0.3, 0.1).toNumber()).toBe(0.2);
  });

  it("multiplies exactly", () => {
    expect(mul(19.99, 3).toString()).toBe("59.97");
    expect(mul(0.1, 0.2).toString()).toBe("0.02");
  });

  it("respects naive float trap that fails for plain JS", () => {
    expect(0.1 + 0.2 === 0.3).toBe(false);
    expect(add(0.1, 0.2).eq(0.3)).toBe(true);
  });

  it("rejects division by zero", () => {
    expect(() => div(1, 0)).toThrow("Division by zero");
    expect(() => div(1, "0")).toThrow("Division by zero");
  });

  it("handles negative quantities", () => {
    expect(isNegative(-0.00000001)).toBe(true);
    expect(isNegative(0)).toBe(false);
    expect(isZero(0)).toBe(true);
    expect(isZero("0.000")).toBe(true);
  });

  it("wraps Decimal instances directly", () => {
    const a = new Decimal("10.5");
    const b = new Decimal("1.5");
    expect(add(a, b).toString()).toBe("12");
    expect(toDecimal(a)).toBe(a);
  });

  it("rounds half-up", () => {
    expect(round(2.5, 0).toString()).toBe("3");
    expect(round(2.55, 1).toString()).toBe("2.6");
    expect(round("1.000000009", 8).toString()).toBe("1.00000001");
    expect(round("1.000000004", 8).toFixed(8)).toBe("1.00000000");
  });

  it("compares exact decimal values", () => {
    // 0.1 + 0.2 computed through the decimal helpers is exactly 0.3.
    expect(equals(add(0.1, 0.2), 0.3)).toBe(true);
    expect(equals("1.2345", "1.2346", 3)).toBe(true);
    expect(equals("1.2345", "1.2346", 4)).toBe(false);
  });

  it("computes min/max/abs", () => {
    expect(max(1, 2).toString()).toBe("2");
    expect(min(1, 2).toString()).toBe("1");
    expect(abs(-5.5).toString()).toBe("5.5");
  });

  it("formats to money precision", () => {
    expect(format(1234.567)).toBe("1234.57");
    expect(format("0.5")).toBe("0.50");
  });

  it("keeps price/quantity multiplication exact for positions", () => {
    const price = "68000.12345678";
    const quantity = "0.00001234";
    const notional = mul(price, quantity);
    const expected = new Decimal(price).times(quantity);
    expect(notional.eq(expected)).toBe(true);
  });
});
