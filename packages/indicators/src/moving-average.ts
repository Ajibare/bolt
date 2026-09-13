import { Decimal } from "decimal.js";
import { toDecimal, type Money } from "@trading-bolt/shared";

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name}: period must be a positive integer, got ${value}`);
  }
}

/**
 * Simple moving average over the last `period` values.
 *
 * Returns an array aligned with the input: positions before the first full
 * window (`i < period - 1`) are `null`. Values are exact (decimal) — never
 * JavaScript floats.
 */
export function sma(values: ReadonlyArray<Money>, period: number): Array<Decimal | null> {
  assertPositiveInteger(period, "sma");
  const result: Array<Decimal | null> = new Array(values.length).fill(null);
  if (values.length < period) {
    return result;
  }

  let sum = new Decimal(0);
  for (let i = 0; i < values.length; i += 1) {
    sum = sum.plus(toDecimal(values[i]));
    if (i >= period) {
      sum = sum.minus(toDecimal(values[i - period]));
    }
    if (i >= period - 1) {
      result[i] = sum.dividedBy(period);
    }
  }
  return result;
}

/**
 * Exponential moving average.
 *
 * Seeded with the SMA of the first `period` values, then smoothed recursively
 * with multiplier `2 / (period + 1)`. Uses only past and current observations,
 * so it never leaks future data. Positions before the seed are `null`.
 */
export function ema(values: ReadonlyArray<Money>, period: number): Array<Decimal | null> {
  assertPositiveInteger(period, "ema");
  const result: Array<Decimal | null> = new Array(values.length).fill(null);
  if (values.length < period) {
    return result;
  }

  let seed = new Decimal(0);
  for (let i = 0; i < period; i += 1) {
    seed = seed.plus(toDecimal(values[i]));
  }
  seed = seed.dividedBy(period);

  const multiplier = new Decimal(2).dividedBy(new Decimal(period).plus(1));
  result[period - 1] = seed;

  let previous = seed;
  for (let i = period; i < values.length; i += 1) {
    const current = values[i];
    const value = toDecimal(current).minus(previous).times(multiplier).plus(previous);
    result[i] = value;
    previous = value;
  }
  return result;
}
