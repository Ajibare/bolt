import { Decimal } from "decimal.js";
import type { Money } from "@trading-bolt/shared";

/**
 * Position-level financial math. All values are decimal strings; decimals are
 * never converted to JavaScript floats (AGENTS.md §14).
 */

/** Realized P&L when a long position of `quantity` at `avgEntry` is closed at `exitPrice`. */
export function realizedPnlOnClose(input: {
  quantity: Money;
  avgEntryPrice: Money;
  exitPrice: Money;
  exitFee: Money;
}): string {
  const qty = new Decimal(input.quantity);
  const avgEntry = new Decimal(input.avgEntryPrice);
  const exit = new Decimal(input.exitPrice);
  const fee = new Decimal(input.exitFee);
  return qty.times(exit.minus(avgEntry)).minus(fee).toString();
}

/** New average entry after buying more of the same symbol. */
export function averageUpEntry(input: {
  existingQuantity: Money;
  existingAvgEntry: Money;
  addQuantity: Money;
  addPrice: Money;
}): string {
  const existingQty = new Decimal(input.existingQuantity);
  const addQty = new Decimal(input.addQuantity);
  if (existingQty.isZero()) {
    return new Decimal(input.addPrice).toString();
  }
  const total = existingQty.plus(addQty);
  return new Decimal(input.existingAvgEntry)
    .times(existingQty)
    .plus(new Decimal(input.addPrice).times(addQty))
    .div(total)
    .toString();
}

/** Equivocation guard: trades carrying different symbols cannot merge. */
export function assertSameSymbol(a: string, b: string): void {
  if (a !== b) {
    throw new Error(`Symbol mismatch: cannot merge ${a} with ${b}`);
  }
}
