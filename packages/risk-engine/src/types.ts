import type { Money } from "@trading-bolt/shared";

/** Side of a proposed order, matching the shared TradeSide convention. */
export type RiskSide = "buy" | "sell";

/**
 * A proposed order to be risk-checked. Fields are decimal strings; the risk
 * engine never executes anything — it returns a deterministic verdict.
 */
export interface OrderProposal {
  symbol: string;
  side: RiskSide;
  quantity: Money;
  /** Reference price (entry/limit) for exposure math. */
  price: Money;
  /** Absolute stop-loss price, required when `requireStopLoss` is set. */
  stopLoss?: Money;
  /** Absolute take-profit price, required when `requireTakeProfit` is set. */
  takeProfit?: Money;
}

/**
 * Server-side account facts the risk engine needs. These come from Trading
 * Bolt's own ledger (never from the frontend — AGENTS.md §18).
 */
export interface RiskAccountState {
  /** Mark-to-market account equity. */
  equity: Money;
  /** Today's realized P&L (negative = loss), in currency. */
  realizedPnlToday: Money;
  /** Number of currently open positions. */
  openPositions: number;
  /** Fraction of equity currently committed to positions (0..1). */
  currentExposure: Money;
  /** Current fractional drawdown from peak equity (0..1). */
  currentDrawdown: Money;
}

/**
 * UTC window during which trading is permitted. `startMinutes`/`endMinutes`
 * are minutes since UTC midnight; when `startMinutes > endMinutes` the window
 * wraps past midnight. `null` in a RiskConfig disables the restriction.
 */
export interface TradingSession {
  startMinutes: number;
  endMinutes: number;
}

/**
 * Configurable risk limits. All fractions are decimal strings. Values are
 * validated by `validateRiskConfig` before evaluation.
 */
export interface RiskConfig {
  /** Fraction of equity risked per trade, e.g. "0.01" (1%). */
  maxRiskPerTrade: Money;
  /** Maximum fraction of equity committed to a single position. */
  maxPositionSize: Money;
  /** Maximum fraction of equity exposure across all positions. */
  maxExposure: Money;
  /** Maximum number of concurrently open positions. */
  maxOpenPositions: number;
  /** Maximum fractional daily loss before new trades are rejected. */
  maxDailyLoss: Money;
  /** Maximum fractional drawdown before new trades are rejected. */
  maxDrawdown: Money;
  /** Reject orders without a stop-loss when true. */
  requireStopLoss: boolean;
  /** Reject orders without a take-profit when true. */
  requireTakeProfit: boolean;
  /** Maximum fractional stop distance from entry (e.g. "0.05"). */
  maxStopLossDistance: Money;
  /** Maximum fractional take-profit distance from entry. */
  maxTakeProfitDistance: Money;
  /** Restrict to a symbol list; null = any supported symbol. */
  allowedSymbols: string[] | null;
  /** Restrict to specific sides; null = both sides allowed. */
  allowedSides: RiskSide[] | null;
  /** UTC trading window; null = always tradable. */
  tradingSession: TradingSession | null;
}

/** Circuit breaker severities (AGENTS.md §19). */
export type CircuitBreakerSeverity = "strategy" | "bot" | "account" | "global";

export const CIRCUIT_BREAKER_SEVERITIES: readonly CircuitBreakerSeverity[] = [
  "strategy",
  "bot",
  "account",
  "global",
] as const;

export type CircuitBreakerState = "CLOSED" | "OPEN";

export const RISK_RULE_IDS = [
  "symbol-allowed",
  "side-allowed",
  "session-allowed",
  "stop-loss-required",
  "take-profit-required",
  "stop-loss-distance",
  "take-profit-distance",
  "max-risk-per-trade",
  "max-position-size",
  "max-exposure",
  "max-positions",
  "max-daily-loss",
  "max-drawdown",
  "circuit-breaker",
] as const;

export type RiskRuleId = (typeof RISK_RULE_IDS)[number];

export interface RuleResult {
  rule: RiskRuleId;
  passed: boolean;
  message?: string;
}

export interface RiskDecision {
  /** True only when every rule passed. */
  approved: boolean;
  /** Per-rule results, always returned for auditability. */
  results: RuleResult[];
  /** Human-readable reasons when rejected (empty when approved). */
  reasons: string[];
}

export interface RiskEvaluationInput {
  proposal: OrderProposal;
  account: RiskAccountState;
  config: RiskConfig;
  /** Injected clock for deterministic session checks (defaults to now). */
  now?: Date;
  /** Open circuit breakers observed by the caller (defaults to none). */
  openBreakers?: ReadonlyArray<CircuitBreakerSeverity>;
}
