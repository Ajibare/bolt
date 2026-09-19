import {
  constrainRiskConfig,
  DEFAULT_RISK_CONFIG,
  validateRiskConfig,
  type RiskConfig,
} from '@trading-bolt/risk-engine';

/**
 * Server-owned maximum-permissive risk policy for bots (AGENTS.md §18: never
 * trust risk values supplied by the client). A bot's stored `riskConfig` is
 * always this ceiling clamped against the user's request, so a request can only
 * tighten the policy, never loosen it. The ceiling is re-applied at execution
 * time so bots persisted before a policy change cannot bypass it.
 */
export const BOT_RISK_POLICY: RiskConfig = validateRiskConfig({
  ...DEFAULT_RISK_CONFIG,
  allowedSymbols: null,
  allowedSides: null,
  tradingSession: null,
});

/** Applies the server risk ceiling to an untrusted bot risk config. */
export function applyBotRiskPolicy(
  requested: Record<string, unknown> | undefined,
): RiskConfig {
  return constrainRiskConfig(
    requested as Partial<RiskConfig> | undefined,
    BOT_RISK_POLICY,
  );
}
