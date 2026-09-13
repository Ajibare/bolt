import type {
  RiskAccountState,
  RiskConfig,
  RiskDecision,
  OrderProposal,
  RiskSide,
} from "./types.js";
import { runRules } from "./rules.js";
import { sizePosition } from "./position-sizing.js";
import { utcClock } from "./session.js";
import { validateRiskConfig } from "./risk-config.js";

/**
 * Step B — the single gateway every order must pass through (AGENTS.md §10).
 *
 * Signal -> Risk Evaluator -> APPROVED | REJECTED (with reasons).
 * Deterministic: config + account + proposal (+ clock) determine the verdict.
 */

export interface EvaluateOrderInput {
  proposal: OrderProposal;
  account: RiskAccountState;
  config: Partial<RiskConfig> | undefined;
  /** Epoch-ms clock; defaults to Date.now(). Injectable for tests. */
  nowMs?: number;
  /** Severity labels of circuit breakers currently OPEN. */
  openBreakers?: ReadonlyArray<string>;
}

export function evaluateOrder(input: EvaluateOrderInput): RiskDecision {
  const config = validateRiskConfig(input.config);
  const nowMs = input.nowMs ?? Date.now();
  const openBreakers = input.openBreakers ?? [];
  const proposal = input.proposal;

  const results = runRules({
    config,
    account: input.account,
    proposal,
    sessionClockMinutes: config.tradingSession ? utcClock(nowMs).minutesOfDay : null,
    openBreakers,
  });

  const failed = results.filter((r) => !r.passed);
  return {
    approved: failed.length === 0,
    results,
    reasons: failed.map((r) => r.reason ?? r.rule),
  };
}

/** Sizes a position from the stop-loss-distance model using config tolerances. */
export interface SizeFromConfigInput {
  side: RiskSide;
  equity: string;
  entryPrice: string;
  stopLoss: string;
  config: Partial<RiskConfig> | undefined;
}

export function sizePositionFromConfig(input: SizeFromConfigInput) {
  const config = validateRiskConfig(input.config);
  return sizePosition({
    side: input.side,
    equity: input.equity,
    riskFraction: config.maxRiskPerTrade,
    entryPrice: input.entryPrice,
    stopLoss: input.stopLoss,
  });
}
