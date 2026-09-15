import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import {
  CircuitBreakerRegistry,
  evaluateBreaches,
  validateRiskConfig,
  type RiskAccountState,
  type RiskConfig,
} from '@trading-bolt/risk-engine';
import { toDecimal, type Money } from '@trading-bolt/shared';
import { LiveAccountRiskTracker } from './account-risk-tracker.js';
import { CircuitBreakerEntity } from './circuit-breaker.entity.js';
import { CircuitBreakerRepository } from './circuit-breaker.repository.js';

export const severityForAccount = (accountId: string): string =>
  `account:${accountId}`;
export const severityForBot = (botId: string): string => `bot:${botId}`;
export const GLOBAL_BREAKER = 'global';

export const BREAKER_SEVERITY_PREFIXES = ['account:', 'bot:'] as const;

export interface AccountRiskFactsInput {
  equity: Money;
  /** Number of open positions at the broker. */
  openPositions: number;
  /** Mark-to-market notional exposure (position quantity x mark price). */
  exposureNotional: Money;
  /** Mark price for the proposal's symbol (used for held-position facts). */
  markPrice: Money;
  /** Signed held quantity in the proposal symbol at the broker (0 = flat). */
  heldQuantity?: Money;
}

/** Raised when a circuit breaker is or becomes OPEN (AGENTS.md §19). */
export class CircuitBreakerOpenError extends Error {
  constructor(reason: string) {
    super(`CIRCUIT_BREAKER: ${reason}`);
    this.name = 'CircuitBreakerOpenError';
  }
}

/**
 * Account-level circuit breaker (AGENTS.md §19): daily-loss and drawdown
 * breaches trip an OPEN breaker that blocks further entries until explicitly
 * reset. Trip state is persisted (`circuit_breakers`) so a restart never
 * auto-closes an open breaker; the registry is hydrated at bootstrap.
 */
@Injectable()
export class CircuitBreakerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly registry = new CircuitBreakerRegistry();
  private readonly tracker = new LiveAccountRiskTracker();

  constructor(
    @Inject(CircuitBreakerRepository)
    private readonly repository: CircuitBreakerRepository,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const stored = await this.repository.list();
    for (const breaker of stored) {
      this.registry.trip(
        breaker.severity,
        breaker.reason,
        breaker.trippedAt.getTime(),
      );
      this.logger.warn('CIRCUIT_BREAKER_RESTORED', {
        severity: breaker.severity,
        reason: breaker.reason,
      });
    }
  }

  isOpen(severity: string): boolean {
    return this.registry.isOpen(severity);
  }

  open(): ReadonlyArray<{
    severity: string;
    reason: string;
    trippedAtMs: number;
  }> {
    return this.registry.open();
  }

  /** Explicitly resets a breaker — the caller owns the safety decision. */
  async reset(severity: string): Promise<void> {
    this.registry.reset(severity);
    await this.repository.deleteBySeverity(severity);
  }

  /** Open severities that apply to a given account+bot (global + scoped). */
  openSeverities(accountId: string, botId: string): string[] {
    const candidates = [
      GLOBAL_BREAKER,
      severityForAccount(accountId),
      severityForBot(botId),
    ];
    return candidates.filter((severity) => this.registry.isOpen(severity));
  }

  /**
   * Builds server-side risk facts from broker-observed values (equity, open
   * positions, exposure) plus the intraday tracker (daily loss, drawdown).
   */
  buildAccountFacts(input: AccountRiskFactsInput): RiskAccountState {
    const exposure = this.fraction(
      this.equityOf(input.equity),
      toDecimal(input.exposureNotional),
    );
    return {
      equity: toDecimal(input.equity).toString(),
      realizedPnlToday: '0',
      currentDrawdown: '0',
      openPositions: input.openPositions,
      currentExposure: exposure,
      heldPosition: this.heldPositionOf(input),
    };
  }

  /**
   * Updates the account risk window from the broker's total equity and returns
   * the same facts enriched with today's realized P&L and current drawdown.
   */
  observeAccount(
    input: AccountRiskFactsInput,
    accountId: string,
    nowMs = Date.now(),
  ): RiskAccountState {
    const { realizedPnlToday, currentDrawdown } = this.tracker.observe(
      accountId,
      toDecimal(input.equity).toString(),
      nowMs,
    );
    const facts = this.buildAccountFacts(input);
    return { ...facts, realizedPnlToday, currentDrawdown };
  }

  /**
   * Trips (and persists) the account/bot breakers and throws when either
   * broker-observed or tracker-derived account health breaches configured
   * limits. Never runs for reduce-only orders (a blocked exit could prevent
   * de-risking).
   */
  async assertTradingAllowed(
    accountId: string,
    botId: string,
    facts: RiskAccountState,
    config: Partial<RiskConfig> | undefined,
  ): Promise<void> {
    const rules = validateRiskConfig(config);
    const findings = evaluateBreaches(facts, rules);
    if (findings.length === 0) {
      return;
    }
    for (const finding of findings) {
      await this.tripAndPersist(severityForAccount(accountId), finding.reason);
      await this.tripAndPersist(severityForBot(botId), finding.reason);
    }
    const reasons = findings.map((finding) => finding.reason).join('; ');
    this.logger.error('CIRCUIT_BREAKER_TRIGGERED', {
      accountId,
      botId,
      reasons,
    });
    throw new CircuitBreakerOpenError(reasons);
  }

  /** Opens a breaker in the registry AND in the database (AGENTS.md §19). */
  private async tripAndPersist(
    severity: string,
    reason: string,
  ): Promise<void> {
    this.registry.trip(severity, reason, Date.now());
    const breaker = new CircuitBreakerEntity();
    breaker.severity = severity;
    breaker.reason = reason;
    breaker.trippedAt = new Date();
    await this.repository.save(breaker);
  }

  private equityOf(value: Money): string {
    return toDecimal(value).toString();
  }

  private fraction(
    equity: string,
    notional: ReturnType<typeof toDecimal>,
  ): string {
    const e = toDecimal(equity);
    return e.isZero() ? '0' : notional.div(e).toString();
  }

  private heldPositionOf(
    input: AccountRiskFactsInput,
  ): RiskAccountState['heldPosition'] {
    const quantity = toDecimal(input.heldQuantity ?? '0');
    if (quantity.isZero()) {
      return undefined;
    }
    return {
      quantity: quantity.abs().toString(),
      side: quantity.isNegative() ? 'short' : 'long',
    };
  }
}
