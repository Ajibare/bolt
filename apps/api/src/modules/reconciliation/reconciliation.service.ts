import { Injectable, Logger } from '@nestjs/common';
import { toDecimal, type Money } from '@trading-bolt/shared';
import type {
  ReconciliationJob,
  ReconciliationOutcome,
} from '@trading-bolt/shared';
import type { BrokerAdapter } from '@trading-bolt/broker-adapters';
import { BrokersService } from '../brokers/brokers.service.js';
import { PaperOrderRepository } from '../paper-trading/paper-trading.repository.js';
import { PaperOrderEntity } from '../paper-trading/entities/paper-trading.entity.js';

/** Local statuses that may still change at the broker (AGENTS.md §17). */
const PENDING_LIVE_STATUSES = new Set([
  'SUBMITTED',
  'ACCEPTED',
  'PARTIALLY_FILLED',
]);

const TERMINAL_STATUSES = new Set([
  'FILLED',
  'CANCELLED',
  'REJECTED',
  'FAILED',
]);

/**
 * Order reconciliation (AGENTS.md §17): compares local live-provider orders
 * against the broker's view and brings the local ledger row in line without
 * fabricating any fill data.
 *
 * Safety rules:
 * - The broker is only ever probed (`getOrder`), never mutated from here.
 * - A fresh fill is copied verbatim from the broker reply; nothing is guessed.
 * - A terminal local order that is still open at the broker is a MISMATCH —
 *   the local row is kept and the divergence is logged, never silently
 *   reverted.
 * - An order the broker no longer knows is marked FAILED locally (it can never
 *   converge), never left dangling.
 */
@Injectable()
export class OrderReconciliationService {
  private readonly logger = new Logger(OrderReconciliationService.name);

  constructor(
    private readonly orders: PaperOrderRepository,
    private readonly brokers: BrokersService,
  ) {}

  async reconcile(job?: ReconciliationJob): Promise<ReconciliationOutcome> {
    const adapter = this.brokers.getLiveAdapter();
    if (!adapter) {
      return { checked: 0, updated: 0, mismatches: [] };
    }

    const pending = await this.orders.listPendingLive(job?.accountId);
    const outcome: ReconciliationOutcome = {
      checked: pending.length,
      updated: 0,
      mismatches: [],
    };

    for (const order of pending) {
      await this.reconcileOrder(order, adapter, outcome);
    }

    if (outcome.checked > 0) {
      this.logger.log('BROKER_RECONCILED', {
        checked: outcome.checked,
        updated: outcome.updated,
        mismatches: outcome.mismatches.length,
      });
    }
    return outcome;
  }

  private async reconcileOrder(
    order: PaperOrderEntity,
    adapter: BrokerAdapter,
    outcome: ReconciliationOutcome,
  ): Promise<void> {
    if (!order.brokerOrderId) {
      outcome.mismatches.push({
        orderId: order.id,
        detail: 'Live order without brokerOrderId',
      });
      return;
    }

    let remote;
    try {
      remote = await adapter.getOrder(order.brokerOrderId, {
        symbol: order.symbol,
      });
    } catch (error) {
      const detail = (error as Error).message ?? 'Unknown broker error';
      this.logger.error('BROKER_RECONCILE_ERROR', {
        orderId: order.id,
        brokerOrderId: order.brokerOrderId,
        detail,
      });
      outcome.mismatches.push({
        orderId: order.id,
        detail: `Broker lookup failed: ${detail}`,
      });
      return;
    }

    if (!remote) {
      order.status = 'FAILED';
      order.reason = 'Not found at broker during reconciliation';
      order.brokerStatus = 'NOT_FOUND';
      order.lastSyncedAt = new Date();
      await this.orders.save(order);
      outcome.updated += 1;
      this.logger.warn('BROKER_ORDER_MISSING', {
        orderId: order.id,
        brokerOrderId: order.brokerOrderId,
      });
      return;
    }

    if (remote.symbol !== order.symbol || remote.side !== order.side) {
      outcome.mismatches.push({
        orderId: order.id,
        detail: `Broker identity mismatch (${remote.symbol}/${remote.side})`,
      });
    }

    const divergent =
      remote.symbol !== order.symbol ||
      remote.side !== order.side ||
      (PENDING_LIVE_STATUSES.has(remote.status) &&
        TERMINAL_STATUSES.has(order.status));

    let changed = false;
    const feesBefore = order.fees;

    if (
      TERMINAL_STATUSES.has(remote.status) &&
      !TERMINAL_STATUSES.has(order.status)
    ) {
      order.status = remote.status;
      order.filledQuantity = this.money(remote.filledQuantity);
      order.avgFillPrice = this.moneyOrNull(remote.avgFillPrice);
      order.fees = this.money(remote.fees);
      order.reason = remote.reason ?? null;
      changed = true;
    } else if (
      PENDING_LIVE_STATUSES.has(remote.status) &&
      TERMINAL_STATUSES.has(order.status)
    ) {
      outcome.mismatches.push({
        orderId: order.id,
        detail: `Local ${order.status} but broker still reports ${remote.status}`,
      });
    } else if (remote.status === 'PARTIALLY_FILLED') {
      order.filledQuantity = this.money(remote.filledQuantity);
      order.avgFillPrice = this.moneyOrNull(remote.avgFillPrice);
      order.fees = this.money(remote.fees);
      changed = true;
    }

    // Fees converge from the broker's cumulative figures whenever the remote
    // view is faithful — even when both sides are already FILLED: a market
    // entry fills at creation, and on that first sweep the real myTrades fees
    // replace the provisional "0". Divergent views never touch local fees.
    if (!divergent) {
      const settledFees = this.money(remote.fees);
      if (order.fees !== settledFees) {
        order.fees = settledFees;
        changed = true;
      }
    } else {
      order.fees = feesBefore;
    }

    order.brokerStatus = remote.status;
    order.lastSyncedAt = new Date();
    await this.orders.save(order);
    if (changed) {
      outcome.updated += 1;
    }
  }

  /** Normalize a Money value to its decimal string form. */
  private money(value: Money): string {
    return toDecimal(value).toString();
  }

  /** Normalize an optional Money value, preserving null. */
  private moneyOrNull(value: Money | undefined | null): string | null {
    return value === undefined || value === null ? null : this.money(value);
  }
}
