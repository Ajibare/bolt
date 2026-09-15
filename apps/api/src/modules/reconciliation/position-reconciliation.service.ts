import { Injectable, Logger } from '@nestjs/common';
import type { BrokerPosition } from '@trading-bolt/broker-adapters';
import {
  toDecimal,
  type PositionReconciliationOutcome,
  type ReconciliationJob,
} from '@trading-bolt/shared';
import { BrokersService } from '../brokers/brokers.service.js';
import { PaperOrderRepository } from '../paper-trading/paper-trading.repository.js';
import { PaperOrderEntity } from '../paper-trading/entities/paper-trading.entity.js';

/**
 * Position reconciliation (AGENTS.md §17): compares the net position implied
 * by the local live order ledger against the broker's held position for the
 * same account, and reports differences.
 *
 * The expected net per symbol is the classic fill identity `Σ signed(qty)`:
 * every buy adds its filled quantity and every sell subtracts its filled
 * quantity, whether the order opened or reduced a position. Fills are only
 * ever copied from the broker by order reconciliation, so the ledger view is
 * only as trustworthy as the last order sweep.
 *
 * Safety rules:
 * - Read-only: the broker is probed (`getPositions`) and never mutated; no
 *   ledger row is written or auto-corrected. Divergences are logged so a
 *   human can decide next steps.
 * - A position that predates Trading Bolt (broker holds it but the local
 *   ledger never touched it) is a legitimate divergence and is flagged, not
 *   silently adopted.
 * - An unreadable broker is skipped for that account and logged; partial
 *   sweeps are still reported.
 */
@Injectable()
export class PositionReconciliationService {
  private readonly logger = new Logger(PositionReconciliationService.name);

  constructor(
    private readonly orders: PaperOrderRepository,
    private readonly brokers: BrokersService,
  ) {}

  async reconcile(
    job?: ReconciliationJob,
  ): Promise<PositionReconciliationOutcome> {
    const adapter = this.brokers.getBybitAdapter();
    const skipped: PositionReconciliationOutcome = {
      checkedAccounts: 0,
      comparedSymbols: 0,
      divergences: [],
    };
    if (!adapter) {
      return skipped;
    }

    const accounts = job?.accountId
      ? [job.accountId]
      : await this.orders.listLiveAccounts();

    const outcome: PositionReconciliationOutcome = {
      checkedAccounts: 0,
      comparedSymbols: 0,
      divergences: [],
    };

    for (const accountId of accounts) {
      const local = await this.orders.listByAccount(accountId);
      if (!local.some((order) => order.provider === 'bybit')) {
        continue;
      }
      const expected = this.expectedNetPositions(local);

      let brokerPositions: BrokerPosition[];
      try {
        brokerPositions = await adapter.getPositions();
      } catch (error) {
        this.logger.error('POSITION_RECONCILE_ERROR', {
          accountId,
          detail: (error as Error).message ?? 'Unknown broker error',
        });
        continue;
      }

      outcome.checkedAccounts += 1;
      this.comparePositions(accountId, expected, brokerPositions, outcome);
    }

    if (outcome.checkedAccounts > 0) {
      this.logger.log('POSITIONS_RECONCILED', {
        checkedAccounts: outcome.checkedAccounts,
        comparedSymbols: outcome.comparedSymbols,
        divergences: outcome.divergences.length,
      });
    }
    return outcome;
  }

  /** Signed net position per symbol from the local live order fills. */
  private expectedNetPositions(
    orders: PaperOrderEntity[],
  ): Map<string, string> {
    const expected = new Map<string, ReturnType<typeof toDecimal>>();
    for (const order of orders) {
      if (order.provider !== 'bybit') {
        continue;
      }
      const filled = toDecimal(order.filledQuantity ?? '0');
      if (filled.isZero()) {
        continue;
      }
      const delta = order.side === 'buy' ? filled : filled.negated();
      expected.set(
        order.symbol,
        (expected.get(order.symbol) ?? toDecimal('0')).plus(delta),
      );
    }
    const normalized = new Map<string, string>();
    for (const [symbol, net] of expected) {
      normalized.set(symbol, net.toString());
    }
    return normalized;
  }

  private comparePositions(
    accountId: string,
    expected: Map<string, string>,
    brokerPositions: BrokerPosition[],
    outcome: PositionReconciliationOutcome,
  ): void {
    const broker = new Map(
      brokerPositions
        .filter((position) => !toDecimal(position.quantity).isZero())
        .map((position) => [position.symbol, position.quantity.toString()]),
    );
    const symbols = new Set<string>([...expected.keys(), ...broker.keys()]);

    for (const symbol of symbols) {
      outcome.comparedSymbols += 1;
      const local = expected.get(symbol) ?? '0';
      const remote = broker.get(symbol) ?? '0';
      if (toDecimal(local).eq(toDecimal(remote))) {
        continue;
      }
      outcome.divergences.push({
        accountId,
        symbol,
        expected: local,
        broker: remote,
      });
      this.logger.warn('POSITION_DIVERGENCE', {
        accountId,
        symbol,
        expected: local,
        broker: remote,
      });
    }
  }
}
