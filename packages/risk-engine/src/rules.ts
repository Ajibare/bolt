import { Decimal } from "decimal.js";
import type {
  OrderProposal,
  RiskAccountState,
  RiskConfig,
  RiskRuleId,
  TradingSession,
} from "./types.js";

/**
 * Step B — individual deterministic risk rules (AGENTS.md §18/§10).
 *
 * Each check is a pure function: config + proposal + account in, verdict out.
 * No rule has side effects, so the matrix is reproducible and testable.
 */

export interface RuleCheck {
  rule: RiskRuleId;
  passed: boolean;
  reason?: string;
}

interface RuleContext {
  config: RiskConfig;
  account: RiskAccountState;
  proposal: OrderProposal;
  sessionClockMinutes: number | null;
  openBreakers: ReadonlyArray<string>;
}

function pass(rule: RiskRuleId): RuleCheck {
  return { rule, passed: true };
}

function fail(rule: RiskRuleId, reason: string): RuleCheck {
  return { rule, passed: false, reason };
}

export function checkSymbol(ctx: RuleContext): RuleCheck {
  const { config, proposal } = ctx;
  if (!config.allowedSymbols) {
    return pass("symbol-allowed");
  }
  return config.allowedSymbols.includes(proposal.symbol)
    ? pass("symbol-allowed")
    : fail("symbol-allowed", `Symbol "${proposal.symbol}" is not in the allowed list`);
}

export function checkSide(ctx: RuleContext): RuleCheck {
  const { config, proposal } = ctx;
  if (!config.allowedSides) {
    return pass("side-allowed");
  }
  return config.allowedSides.includes(proposal.side)
    ? pass("side-allowed")
    : fail("side-allowed", `Side "${proposal.side}" is not allowed`);
}

export function checkSession(ctx: RuleContext): RuleCheck {
  const { config, sessionClockMinutes } = ctx;
  if (!config.tradingSession || sessionClockMinutes === null) {
    return pass("session-allowed");
  }
  const session = config.tradingSession;
  const within = isWithin(session, sessionClockMinutes);
  return within
    ? pass("session-allowed")
    : fail("session-allowed", "Outside permitted trading session");
}

export function checkStopLossRequired(ctx: RuleContext): RuleCheck {
  const { config, proposal } = ctx;
  if (!config.requireStopLoss) {
    return pass("stop-loss-required");
  }
  if (proposal.stopLoss === undefined || proposal.stopLoss === null) {
    return fail("stop-loss-required", "Stop-loss is required but not provided");
  }
  return pass("stop-loss-required");
}

export function checkTakeProfitRequired(ctx: RuleContext): RuleCheck {
  const { config, proposal } = ctx;
  if (!config.requireTakeProfit) {
    return pass("take-profit-required");
  }
  if (proposal.takeProfit === undefined || proposal.takeProfit === null) {
    return fail("take-profit-required", "Take-profit is required but not provided");
  }
  return pass("take-profit-required");
}

export function checkStopLossDistance(ctx: RuleContext): RuleCheck {
  const { config, proposal } = ctx;
  if (proposal.stopLoss === undefined || proposal.stopLoss === null) {
    return pass("stop-loss-distance");
  }
  const price = new Decimal(proposal.price);
  const stop = new Decimal(proposal.stopLoss);
  const maxDist = new Decimal(config.maxStopLossDistance);
  const distance = price.minus(stop).abs().div(price);
  return distance.lte(maxDist)
    ? pass("stop-loss-distance")
    : fail(
        "stop-loss-distance",
        `Stop-loss distance (${distance.toString()}) exceeds maximum (${maxDist.toString()})`,
      );
}

export function checkTakeProfitDistance(ctx: RuleContext): RuleCheck {
  const { config, proposal } = ctx;
  if (proposal.takeProfit === undefined || proposal.takeProfit === null) {
    return pass("take-profit-distance");
  }
  const price = new Decimal(proposal.price);
  const takeProfit = new Decimal(proposal.takeProfit);
  const maxDist = new Decimal(config.maxTakeProfitDistance);
  const distance = price.minus(takeProfit).abs().div(price);
  return distance.lte(maxDist)
    ? pass("take-profit-distance")
    : fail(
        "take-profit-distance",
        `Take-profit distance (${distance.toString()}) exceeds maximum (${maxDist.toString()})`,
      );
}

export function checkMaxRiskPerTrade(ctx: RuleContext): RuleCheck {
  const { config, account, proposal } = ctx;
  if (proposal.stopLoss === undefined || proposal.stopLoss === null) {
    return pass("max-risk-per-trade");
  }
  const equity = new Decimal(account.equity);
  const price = new Decimal(proposal.price);
  const stop = new Decimal(proposal.stopLoss);
  const qty = new Decimal(proposal.quantity);
  const maxAllowable = equity.times(config.maxRiskPerTrade);

  // Risk per trade = quantity * |price - stop|  (stop side already validated in sizing).
  const distance = price.minus(stop).abs();
  const risk = qty.times(distance);
  return risk.lte(maxAllowable)
    ? pass("max-risk-per-trade")
    : fail(
        "max-risk-per-trade",
        `Risk per trade (${risk.toString()}) exceeds maximum (${maxAllowable.toString()})`,
      );
}

export function checkMaxPositionSize(ctx: RuleContext): RuleCheck {
  const { config, account, proposal } = ctx;
  const equity = new Decimal(account.equity);
  const notional = new Decimal(proposal.quantity).times(proposal.price);
  const maxNotional = equity.times(config.maxPositionSize);
  return notional.lte(maxNotional)
    ? pass("max-position-size")
    : fail(
        "max-position-size",
        `Notional (${notional.toString()}) exceeds maximum (${maxNotional.toString()})`,
      );
}

export function checkMaxExposure(ctx: RuleContext): RuleCheck {
  const { config, account, proposal } = ctx;
  const equity = new Decimal(account.equity);
  const notional = new Decimal(proposal.quantity).times(proposal.price);
  const exposureAfter = new Decimal(account.currentExposure).plus(notional.div(equity));
  return exposureAfter.lte(config.maxExposure)
    ? pass("max-exposure")
    : fail(
        "max-exposure",
        `Exposure after trade (${exposureAfter.toString()}) exceeds maximum (${config.maxExposure})`,
      );
}

export function checkMaxPositions(ctx: RuleContext): RuleCheck {
  const { config, account } = ctx;
  if (account.openPositions >= config.maxOpenPositions) {
    return fail(
      "max-positions",
      `Open positions (${account.openPositions}) at limit (${config.maxOpenPositions})`,
    );
  }
  return pass("max-positions");
}

export function checkMaxDailyLoss(ctx: RuleContext): RuleCheck {
  const { config, account } = ctx;
  const equity = new Decimal(account.equity);
  const maxLoss = equity.times(config.maxDailyLoss);
  if (new Decimal(account.realizedPnlToday).lt(maxLoss.negated())) {
    return fail(
      "max-daily-loss",
      `Daily loss (${account.realizedPnlToday}) below limit (${maxLoss.negated().toString()})`,
    );
  }
  return pass("max-daily-loss");
}

export function checkMaxDrawdown(ctx: RuleContext): RuleCheck {
  const { config, account } = ctx;
  if (new Decimal(account.currentDrawdown).gt(config.maxDrawdown)) {
    return fail(
      "max-drawdown",
      `Drawdown (${account.currentDrawdown}) exceeds limit (${config.maxDrawdown})`,
    );
  }
  return pass("max-drawdown");
}

export function checkCircuitBreaker(ctx: RuleContext): RuleCheck {
  if (ctx.openBreakers.length === 0) {
    return pass("circuit-breaker");
  }
  return fail("circuit-breaker", `Circuit breaker(s) OPEN: ${ctx.openBreakers.join(", ")}`);
}

function isWithin(session: TradingSession, minutes: number): boolean {
  const { startMinutes, endMinutes } = session;
  if (startMinutes === endMinutes) {
    return true;
  }
  if (startMinutes < endMinutes) {
    return minutes >= startMinutes && minutes < endMinutes;
  }
  // Wraps past midnight: e.g. 22:00 -> 06:00
  return minutes >= startMinutes || minutes < endMinutes;
}

export function runRules(ctx: RuleContext): RuleCheck[] {
  return [
    checkSymbol(ctx),
    checkSide(ctx),
    checkSession(ctx),
    checkStopLossRequired(ctx),
    checkTakeProfitRequired(ctx),
    checkStopLossDistance(ctx),
    checkTakeProfitDistance(ctx),
    checkMaxRiskPerTrade(ctx),
    checkMaxPositionSize(ctx),
    checkMaxExposure(ctx),
    checkMaxPositions(ctx),
    checkMaxDailyLoss(ctx),
    checkMaxDrawdown(ctx),
    checkCircuitBreaker(ctx),
  ];
}
