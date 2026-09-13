import { div, mul, toDecimal } from "@trading-bolt/shared";
import type { Money } from "@trading-bolt/shared";
import type { RiskSide } from "./types.js";
import { InvalidOrderRiskError } from "./errors.js";

/**
 * Position sizing from a stop-loss distance (AGENTS.md §14 / roadmap Phase 5).
 *
 * Cost basis: risk a fixed fraction of equity, then derive the position whose
 * total loss when the stop is hit equals that risk amount.
 *
 *   allowedLoss = equity * maxRiskPerTrade
 *   quantity    = allowedLoss / |entryPrice - stopLoss|
 *   notional    = quantity * entryPrice
 */

export interface PositionSizeInput {
  side: RiskSide;
  /** Mark-to-market equity, decimal string. */
  equity: Money;
  /** Fraction of equity to risk on this trade, e.g. "0.01". */
  riskFraction: Money;
  /** Entry/limit price. */
  entryPrice: Money;
  /** Absolute stop-loss price. */
  stopLoss: Money;
}

export interface PositionSize {
  /** Position size in units of the instrument. */
  quantity: string;
  /** Notional value = quantity * entryPrice. */
  notional: string;
  /** Absolute loss allowed when the stop is hit. */
  allowedLoss: string;
}

export function sizePosition(input: PositionSizeInput): PositionSize {
  const equity = toDecimal(input.equity);
  const riskFraction = toDecimal(input.riskFraction);
  const entry = toDecimal(input.entryPrice);
  const stop = toDecimal(input.stopLoss);

  if (equity.isNegative() || equity.isZero()) {
    throw new InvalidOrderRiskError(`equity must be positive, got "${input.equity}"`);
  }
  if (riskFraction.lte(0) || riskFraction.gt(1)) {
    throw new InvalidOrderRiskError(`riskFraction must be in (0, 1], got "${input.riskFraction}"`);
  }
  if (entry.isZero()) {
    throw new InvalidOrderRiskError("entryPrice must be non-zero");
  }
  if (stop.isZero() || stop.eq(entry)) {
    throw new InvalidOrderRiskError("stopLoss must differ from entryPrice and be non-zero");
  }

  // Stop must be on the correct side of entry relative to the position side.
  const distance = entry.minus(stop).abs();
  if (input.side === "buy" && stop.gte(entry)) {
    throw new InvalidOrderRiskError("stopLoss must be below entryPrice for a long position");
  }
  if (input.side === "sell" && stop.lte(entry)) {
    throw new InvalidOrderRiskError("stopLoss must be above entryPrice for a short position");
  }

  if (distance.isZero()) {
    throw new InvalidOrderRiskError("stopLoss must differ from entryPrice");
  }

  const allowedLoss = mul(equity, riskFraction);
  const quantity = div(allowedLoss, distance);
  const notional = mul(quantity, entry);

  return {
    quantity: quantity.toString(),
    notional: notional.toString(),
    allowedLoss: allowedLoss.toString(),
  };
}
