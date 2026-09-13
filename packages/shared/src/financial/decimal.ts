import { Decimal } from "decimal.js";

/**
 * Financial arithmetic must never rely on careless JavaScript floating
 * point. All money, price, quantity and fee math goes through these
 * helpers backed by `decimal.js`.
 */

export type Money = Decimal.Value;

export const PRECISION = {
  price: 8,
  quantity: 8,
  money: 2,
  fee: 6,
} as const;

const OPTIONS = {
  roundingMode: Decimal.ROUND_HALF_UP,
  toExpNeg: -12,
  toExpPos: 9,
} as const;

Decimal.set({ toExpNeg: OPTIONS.toExpNeg, toExpPos: OPTIONS.toExpPos });

export function toDecimal(value: Money | Decimal): Decimal {
  return value instanceof Decimal ? value : new Decimal(value);
}

export function add(a: Money | Decimal, b: Money | Decimal): Decimal {
  return toDecimal(a).plus(toDecimal(b));
}

export function sub(a: Money | Decimal, b: Money | Decimal): Decimal {
  return toDecimal(a).minus(toDecimal(b));
}

export function mul(a: Money | Decimal, b: Money | Decimal): Decimal {
  return toDecimal(a).times(toDecimal(b));
}

export function div(a: Money | Decimal, b: Money | Decimal): Decimal {
  const divisor = toDecimal(b);
  if (divisor.isZero()) {
    throw new Error("Division by zero in financial calculation");
  }
  return toDecimal(a).dividedBy(divisor);
}

export function isZero(value: Money | Decimal): boolean {
  return toDecimal(value).isZero();
}

export function isNegative(value: Money | Decimal): boolean {
  return toDecimal(value).isNegative();
}

export function abs(value: Money | Decimal): Decimal {
  return toDecimal(value).abs();
}

export function round(value: Money | Decimal, precision: number = PRECISION.money): Decimal {
  return toDecimal(value).toDecimalPlaces(precision, OPTIONS.roundingMode);
}

export function equals(a: Money | Decimal, b: Money | Decimal, precision?: number): boolean {
  if (precision === undefined) {
    return toDecimal(a).eq(toDecimal(b));
  }
  return round(a, precision).eq(round(b, precision));
}

export function max(a: Money | Decimal, b: Money | Decimal): Decimal {
  return Decimal.max(toDecimal(a), toDecimal(b));
}

export function min(a: Money | Decimal, b: Money | Decimal): Decimal {
  return Decimal.min(toDecimal(a), toDecimal(b));
}

export function format(value: Money | Decimal): string {
  return toDecimal(value).toFixed(PRECISION.money);
}
