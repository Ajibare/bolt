import { Decimal } from "decimal.js";
import type { RiskAccountState, RiskConfig } from "./types.js";

/**
 * Independent circuit breakers per severity (AGENTS.md §19). A breaker is
 * OPEN from an explicit trip and never auto-closes: resumption requires
 * explicit, deliberate action.
 */

export interface CircuitBreakerDefinition {
  /** Severity scope: strategy, bot, account, global. */
  severity: string;
  /** Human-readable reason recorded when tripped. */
  reason: string;
  /** Epoch-millisecond time the breaker tripped. */
  trippedAtMs: number;
}

export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreakerDefinition>();

  trip(severity: string, reason: string, at = Date.now()): void {
    this.breakers.set(severity, { severity, reason, trippedAtMs: at });
  }

  /**
   * Explicitly resets a breaker. Does not run safety logic itself; the caller
   * decides whether conditions are truly safe (AGENTS.md §19).
   */
  reset(severity: string): void {
    this.breakers.delete(severity);
  }

  isOpen(severity: string): boolean {
    return this.breakers.has(severity);
  }

  open(): ReadonlyArray<CircuitBreakerDefinition> {
    return [...this.breakers.values()];
  }
}

export interface BreachFinding {
  severity: string;
  reason: string;
}

/**
 * Deterministic trip logic: evaluates account state against config and returns
 * the severities that should be OPEN. Pure — never writes state.
 */
export function evaluateBreaches(account: RiskAccountState, config: RiskConfig): BreachFinding[] {
  const findings: BreachFinding[] = [];

  const eq = new Decimal(account.equity);
  if (!eq.isZero()) {
    const dailyLossFraction = new Decimal(account.realizedPnlToday).negated().div(eq);
    if (dailyLossFraction.gt(new Decimal(config.maxDailyLoss))) {
      findings.push({
        severity: "account",
        reason: `Daily loss (${dailyLossFraction.toString()}) exceeded maxDailyLoss (${config.maxDailyLoss})`,
      });
    }
  }

  if (new Decimal(account.currentDrawdown).gt(new Decimal(config.maxDrawdown))) {
    findings.push({
      severity: "account",
      reason: `Drawdown (${account.currentDrawdown}) exceeded maxDrawdown (${config.maxDrawdown})`,
    });
  }

  return findings;
}
