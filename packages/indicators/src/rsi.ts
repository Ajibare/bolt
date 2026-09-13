import { Decimal } from "decimal.js";
import { toDecimal, type Money } from "@trading-bolt/shared";

/**
 * Wilder's Relative Strength Index.
 *
 * Standard method: average gains/losses over the first `period` price
 * differences, then Wilder smoothing (`(avg * (period - 1) + current) /
 * period`). Returns an array aligned with the input; all values before index
 * `period` (needs `period + 1` observations for `period` differences) are
 * `null`. Exact decimal arithmetic throughout.
 *
 * Boundary rules (deterministic and documented):
 * - average loss is zero  -> RSI 100
 * - average gain is zero  -> RSI 0
 * - both zero (flat)      -> RSI 100
 */
export function rsi(values: ReadonlyArray<Money>, period: number): Array<Decimal | null> {
  if (!Number.isInteger(period) || period <= 0) {
    throw new Error(`rsi: period must be a positive integer, got ${period}`);
  }
  const result: Array<Decimal | null> = new Array(values.length).fill(null);
  if (values.length < period + 1) {
    return result;
  }

  const parsed = values.map(toDecimal);
  let averageGain = new Decimal(0);
  let averageLoss = new Decimal(0);

  for (let i = 1; i <= period; i += 1) {
    const diff = parsed[i].minus(parsed[i - 1]);
    if (diff.isPositive()) {
      averageGain = averageGain.plus(diff);
    } else if (diff.isNegative()) {
      averageLoss = averageLoss.plus(diff.negated());
    }
  }
  averageGain = averageGain.dividedBy(period);
  averageLoss = averageLoss.dividedBy(period);
  result[period] = wilderRsi(averageGain, averageLoss);

  for (let i = period + 1; i < values.length; i += 1) {
    const diff = parsed[i].minus(parsed[i - 1]);
    const gain = diff.isPositive() ? diff : new Decimal(0);
    const loss = diff.isNegative() ? diff.negated() : new Decimal(0);
    averageGain = averageGain
      .times(period - 1)
      .plus(gain)
      .dividedBy(period);
    averageLoss = averageLoss
      .times(period - 1)
      .plus(loss)
      .dividedBy(period);
    result[i] = wilderRsi(averageGain, averageLoss);
  }

  return result;
}

function wilderRsi(averageGain: Decimal, averageLoss: Decimal): Decimal {
  if (averageLoss.isZero()) {
    return new Decimal(100);
  }
  if (averageGain.isZero()) {
    return new Decimal(0);
  }
  const rs = averageGain.dividedBy(averageLoss);
  return new Decimal(100).minus(new Decimal(100).dividedBy(new Decimal(1).plus(rs)));
}
