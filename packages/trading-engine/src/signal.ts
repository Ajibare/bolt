import type { Candle, Signal, SignalDirection } from "@trading-bolt/shared";
import { StrategyError } from "./errors.js";

/**
 * Deterministic signal construction: the signal timestamp follows the latest
 * candle (never wall-clock time) so repeated evaluations are reproducible.
 * Empty candle input is an error — a strategy cannot produce a symbol-anchored
 * signal without at least one bar.
 */
export function buildSignal(
  candles: ReadonlyArray<Candle>,
  strategyId: string,
  direction: SignalDirection,
  reason: string,
): Signal {
  const latest = candles[candles.length - 1];
  if (!latest) {
    throw new StrategyError(
      `Strategy "${strategyId}" cannot evaluate empty candle input`,
      strategyId,
    );
  }
  return {
    symbol: latest.symbol,
    strategyId,
    direction,
    reason,
    timestamp: latest.timestamp,
  };
}

/** HOLD — used for "insufficient data" and neutral responses. */
export function holdSignal(
  candles: ReadonlyArray<Candle>,
  strategyId: string,
  reason: string,
): Signal {
  return buildSignal(candles, strategyId, "hold", reason);
}
