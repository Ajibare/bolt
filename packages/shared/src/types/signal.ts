import type { SupportedSymbol } from "../constants/index.js";

/**
 * Strategy output domain types.
 *
 * Signals are strategy *opinions* only — they never execute orders. Per the
 * architecture, a signal flows to the risk engine, then to the order manager,
 * then to the broker. See AGENTS.md §9.
 */

export const SIGNAL_DIRECTIONS = ["buy", "sell", "hold"] as const;
export type SignalDirection = (typeof SIGNAL_DIRECTIONS)[number];

export function isSignalDirection(value: string): value is SignalDirection {
  return (SIGNAL_DIRECTIONS as readonly string[]).includes(value);
}

export const SIGNAL_SOURCES = ["strategy", "system", "manual"] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

export interface Signal {
  symbol: SupportedSymbol;
  strategyId: string;
  direction: SignalDirection;
  /**
   * Deterministic explanation of why the signal was produced. Must not
   * contain free-form/user-provided text that could be misleading in logs.
   */
  reason: string;
  /** Epoch milliseconds when the signal was generated. */
  timestamp: number;
  /**
   * Bounded confidence hint in [0, 1]. Strategies decide its meaning; it is
   * informational only and never an execution directive.
   */
  strength?: number;
  /** Optional source of a non-strategy signal. Defaults to "strategy". */
  source?: SignalSource;
  /** Optional snapshot of the indicator values that produced the signal. */
  indicatorSnapshot?: Record<string, string>;
}
