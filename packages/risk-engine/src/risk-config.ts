import type { Decimal } from "decimal.js";
import { toDecimal, type Money } from "@trading-bolt/shared";
import type { RiskConfig, RiskSide, TradingSession } from "./types.js";
import { InvalidRiskConfigError } from "./errors.js";

/**
 * Risk configuration is treated as server-side policy (AGENTS.md §18: never
 * trust values supplied by the frontend). This module owns parsing and
 * validation so malformed policy cannot silently disable limits.
 */

export const DEFAULT_RISK_CONFIG: Readonly<
  Omit<RiskConfig, "allowedSymbols" | "allowedSides" | "tradingSession">
> = {
  maxRiskPerTrade: "0.01",
  maxPositionSize: "0.1",
  maxExposure: "0.5",
  maxOpenPositions: 10,
  maxDailyLoss: "0.05",
  maxDrawdown: "0.2",
  requireStopLoss: true,
  requireTakeProfit: false,
  maxStopLossDistance: "0.1",
  maxTakeProfitDistance: "1",
};

const SIDES: readonly RiskSide[] = ["buy", "sell"];
const MINUTES_PER_DAY = 1440;

function isFraction(value: Decimal, allowOne: boolean): boolean {
  return value.gt(0) && (allowOne ? value.lte(1) : value.lt(1));
}

function fractionBounds(label: string, value: Decimal, allowOne: boolean): void {
  if (!isFraction(value, allowOne)) {
    throw new InvalidRiskConfigError(
      `${label} must be a fractional decimal string ${allowOne ? "> 0 and <= 1" : "> 0 and < 1"}, got "${value.toString()}"`,
    );
  }
}

function toInt(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidRiskConfigError(`${label} must be a non-negative integer, got "${value}"`);
  }
  return value;
}

function toMinuteOfDay(label: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1439) {
    throw new InvalidRiskConfigError(`${label} must be an integer in [0, 1439], got "${value}"`);
  }
  return value;
}

/**
 * Validates a session window. Either both limits are absent (no restriction)
 * or both are present.
 */
export function validateTradingSession(
  session: TradingSession | null | undefined,
): TradingSession | null {
  if (session === null || session === undefined) {
    return null;
  }
  return {
    startMinutes: toMinuteOfDay("tradingSession.startMinutes", session.startMinutes),
    endMinutes: toMinuteOfDay("tradingSession.endMinutes", session.endMinutes),
  };
}

/**
 * Validates the full risk config and returns a normalized copy with explicit
 * values (defaults applied). Throws InvalidRiskConfigError on malformed input.
 */
export function validateRiskConfig(config: Partial<RiskConfig> | undefined): RiskConfig {
  if (config === undefined || config === null) {
    throw new InvalidRiskConfigError("Risk config is required");
  }

  const maxRiskPerTrade = toDecimal(config.maxRiskPerTrade ?? DEFAULT_RISK_CONFIG.maxRiskPerTrade);
  fractionBounds("maxRiskPerTrade", maxRiskPerTrade, true);

  const maxPositionSize = toDecimal(config.maxPositionSize ?? DEFAULT_RISK_CONFIG.maxPositionSize);
  fractionBounds("maxPositionSize", maxPositionSize, true);

  const maxExposure = toDecimal(config.maxExposure ?? DEFAULT_RISK_CONFIG.maxExposure);
  fractionBounds("maxExposure", maxExposure, true);

  const maxDailyLoss = toDecimal(config.maxDailyLoss ?? DEFAULT_RISK_CONFIG.maxDailyLoss);
  fractionBounds("maxDailyLoss", maxDailyLoss, true);

  const maxDrawdown = toDecimal(config.maxDrawdown ?? DEFAULT_RISK_CONFIG.maxDrawdown);
  fractionBounds("maxDrawdown", maxDrawdown, true);

  const maxStopLossDistance = toDecimal(
    config.maxStopLossDistance ?? DEFAULT_RISK_CONFIG.maxStopLossDistance,
  );
  fractionBounds("maxStopLossDistance", maxStopLossDistance, true);

  const maxTakeProfitDistance = toDecimal(
    config.maxTakeProfitDistance ?? DEFAULT_RISK_CONFIG.maxTakeProfitDistance,
  );
  fractionBounds("maxTakeProfitDistance", maxTakeProfitDistance, true);

  const maxOpenPositions = toInt(
    "maxOpenPositions",
    config.maxOpenPositions ?? DEFAULT_RISK_CONFIG.maxOpenPositions,
  );

  let allowedSides: RiskSide[] | null = null;
  if (config.allowedSides !== null && config.allowedSides !== undefined) {
    if (!Array.isArray(config.allowedSides) || config.allowedSides.length === 0) {
      throw new InvalidRiskConfigError("allowedSides must be a non-empty array or null");
    }
    for (const side of config.allowedSides) {
      if (!SIDES.includes(side)) {
        throw new InvalidRiskConfigError(`allowedSides contains invalid side "${side}"`);
      }
    }
    allowedSides = [...config.allowedSides];
  }

  let allowedSymbols: string[] | null = null;
  if (config.allowedSymbols !== null && config.allowedSymbols !== undefined) {
    if (!Array.isArray(config.allowedSymbols) || config.allowedSymbols.length === 0) {
      throw new InvalidRiskConfigError("allowedSymbols must be a non-empty array or null");
    }
    allowedSymbols = [...config.allowedSymbols];
  }

  return {
    maxRiskPerTrade: maxRiskPerTrade.toString(),
    maxPositionSize: maxPositionSize.toString(),
    maxExposure: maxExposure.toString(),
    maxOpenPositions,
    maxDailyLoss: maxDailyLoss.toString(),
    maxDrawdown: maxDrawdown.toString(),
    requireStopLoss: config.requireStopLoss ?? DEFAULT_RISK_CONFIG.requireStopLoss,
    requireTakeProfit: config.requireTakeProfit ?? DEFAULT_RISK_CONFIG.requireTakeProfit,
    maxStopLossDistance: maxStopLossDistance.toString(),
    maxTakeProfitDistance: maxTakeProfitDistance.toString(),
    allowedSymbols,
    allowedSides,
    tradingSession: validateTradingSession(config.tradingSession),
  };
}

function takeMin(a: Money, b: Money): Money {
  return toDecimal(a).lte(toDecimal(b)) ? a : b;
}

function intersectValues<T>(requested: T[] | null, ceiling: T[] | null, label: string): T[] | null {
  if (ceiling === null) {
    return requested === null ? null : [...requested];
  }
  if (requested === null) {
    return [...ceiling];
  }
  const allowed = requested.filter((value) => ceiling.includes(value));
  if (allowed.length === 0) {
    throw new InvalidRiskConfigError(`${label} has no overlap with the server risk policy`);
  }
  return allowed;
}

function sessionCovers(session: TradingSession, minute: number): boolean {
  return session.startMinutes <= session.endMinutes
    ? minute >= session.startMinutes && minute <= session.endMinutes
    : minute >= session.startMinutes || minute <= session.endMinutes;
}

function sessionWithin(requested: TradingSession, ceiling: TradingSession): boolean {
  const span =
    requested.startMinutes <= requested.endMinutes
      ? requested.endMinutes - requested.startMinutes
      : MINUTES_PER_DAY - requested.startMinutes + requested.endMinutes;
  for (let offset = 0; offset <= span; offset += 1) {
    const minute = (requested.startMinutes + offset) % MINUTES_PER_DAY;
    if (!sessionCovers(ceiling, minute)) {
      return false;
    }
  }
  return true;
}

function constrainTradingSession(
  requested: TradingSession | null,
  ceiling: TradingSession | null,
): TradingSession | null {
  if (ceiling === null) {
    return requested === null ? null : { ...requested };
  }
  if (requested === null) {
    return { ...ceiling };
  }
  if (!sessionWithin(requested, ceiling)) {
    throw new InvalidRiskConfigError("tradingSession must fall within the server trading window");
  }
  return { ...requested };
}

/**
 * Clamps a caller-supplied risk config against a server-owned ceiling so a
 * client can only ever tighten policy, never loosen it (AGENTS.md §18). Scalars
 * take the stricter bound, requirement booleans are OR-ed, list restrictions are
 * intersected, and a trading window must fit inside the server window. Values
 * omitted by the caller inherit the ceiling. Throws InvalidRiskConfigError when
 * the request is malformed or conflicts irreconcilably with the ceiling.
 */
export function constrainRiskConfig(
  requested: Partial<RiskConfig> | undefined,
  ceiling: RiskConfig,
): RiskConfig {
  const policy = validateRiskConfig(ceiling);
  if (requested === undefined || requested === null) {
    return {
      ...policy,
      allowedSymbols: policy.allowedSymbols ? [...policy.allowedSymbols] : null,
      allowedSides: policy.allowedSides ? [...policy.allowedSides] : null,
      tradingSession: policy.tradingSession ? { ...policy.tradingSession } : null,
    };
  }

  const wanted = validateRiskConfig(requested);
  return {
    maxRiskPerTrade: takeMin(wanted.maxRiskPerTrade, policy.maxRiskPerTrade),
    maxPositionSize: takeMin(wanted.maxPositionSize, policy.maxPositionSize),
    maxExposure: takeMin(wanted.maxExposure, policy.maxExposure),
    maxOpenPositions: Math.min(wanted.maxOpenPositions, policy.maxOpenPositions),
    maxDailyLoss: takeMin(wanted.maxDailyLoss, policy.maxDailyLoss),
    maxDrawdown: takeMin(wanted.maxDrawdown, policy.maxDrawdown),
    requireStopLoss: wanted.requireStopLoss || policy.requireStopLoss,
    requireTakeProfit: wanted.requireTakeProfit || policy.requireTakeProfit,
    maxStopLossDistance: takeMin(wanted.maxStopLossDistance, policy.maxStopLossDistance),
    maxTakeProfitDistance: takeMin(wanted.maxTakeProfitDistance, policy.maxTakeProfitDistance),
    allowedSymbols: intersectValues(wanted.allowedSymbols, policy.allowedSymbols, "allowedSymbols"),
    allowedSides: intersectValues(wanted.allowedSides, policy.allowedSides, "allowedSides"),
    tradingSession: constrainTradingSession(wanted.tradingSession, policy.tradingSession),
  };
}
