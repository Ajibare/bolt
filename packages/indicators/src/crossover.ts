import { Decimal } from "decimal.js";

export type CrossDirection = "bullish" | "bearish" | null;

/**
 * Crossovers between two aligned indicator series.
 *
 * Bullish: series `a` rises strictly above `b` between `i - 1` and `i`.
 * Bearish: series `a` falls strictly below `b` between `i - 1` and `i`.
 *
 * Returns an array aligned with the inputs. Positions where either series is
 * not yet defined (warm-up/null windows) or where no crossing occurred are
 * `null`. The first element is always `null` (requires a previous bar).
 *
 * Uses exact decimal comparison, never floats.
 */
export function crossovers(
  a: ReadonlyArray<Decimal | null>,
  b: ReadonlyArray<Decimal | null>,
): Array<CrossDirection> {
  const length = Math.min(a.length, b.length);
  const result: Array<CrossDirection> = new Array(length).fill(null);

  for (let i = 1; i < length; i += 1) {
    const previousA = a[i - 1];
    const previousB = b[i - 1];
    const currentA = a[i];
    const currentB = b[i];
    if (previousA === null || previousB === null || currentA === null || currentB === null) {
      continue;
    }
    if (currentA.gt(currentB) && previousA.lte(previousB)) {
      result[i] = "bullish";
    } else if (currentA.lt(currentB) && previousA.gte(previousB)) {
      result[i] = "bearish";
    }
  }

  return result;
}
