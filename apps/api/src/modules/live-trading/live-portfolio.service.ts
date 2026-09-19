import { Injectable, Logger } from '@nestjs/common';
import { toDecimal } from '@trading-bolt/shared';
import type { BrokerAccountState } from '@trading-bolt/broker-adapters';
import { BrokersService } from '../brokers/brokers.service.js';
import { PaperOrderRepository } from '../paper-trading/paper-trading.repository.js';
import { LivePortfolioSnapshotEntity } from './live-portfolio-snapshot.entity.js';
import { LivePortfolioRepository } from './live-portfolio.repository.js';

/**
 * Takes live-broker portfolio snapshots (AGENTS.md §13). Every tick pulls the
 * broker's point-in-time balance report for each account that has live
 * activity and persists an immutable equity snapshot so the analytics phase
 * can rebuild a live equity curve.
 *
 * Rules:
 * - Never fabricate a number: equity/cash are summed straight from the
 *   broker's reported balances. `positionValue` and `realizedPnl` are not yet
 *   derivable from spot balances and stay `'0'`.
 * - An unreadable broker or an account with no live activity is skipped and
 *   logged; the next tick retries.
 * - Lives only on the deployed instance with live credentials (the scheduler
 *   gate) — paper-only setups never attempt a broker read.
 */
@Injectable()
export class LivePortfolioService {
  private readonly logger = new Logger(LivePortfolioService.name);

  constructor(
    private readonly brokers: BrokersService,
    private readonly orders: PaperOrderRepository,
    private readonly portfolios: LivePortfolioRepository,
  ) {}

  /**
   * Snapshot every account that has traded live so far. Returns the number of
   * snapshots actually written.
   */
  async recordAll(): Promise<number> {
    const accounts = await this.orders.listLiveAccounts();
    let written = 0;
    for (const accountId of accounts) {
      const snapshot = await this.recordSnapshot(accountId);
      if (snapshot) {
        written += 1;
      }
    }
    if (accounts.length > 0) {
      this.logger.log('LIVE_PORTFOLIO_SNAPSHOT', {
        scannedAccounts: accounts.length,
        written,
      });
    }
    return written;
  }

  /**
   * Record a single snapshot for one account. Returns the persisted snapshot,
   * or null when no live broker is configured, the account has no live
   * activity, or the broker is unreadable on this tick.
   */
  async recordSnapshot(
    accountId: string,
  ): Promise<LivePortfolioSnapshotEntity | null> {
    const adapter = this.brokers.getLiveAdapter();
    if (!adapter) {
      return null;
    }

    let state: BrokerAccountState;
    try {
      state = await adapter.getAccountState();
    } catch (error) {
      this.logger.warn('LIVE_PORTFOLIO_SNAPSHOT_SKIPPED', {
        accountId,
        detail: (error as Error).message ?? 'Unknown broker error',
      });
      return null;
    }

    let equity = toDecimal('0');
    let cash = toDecimal('0');
    for (const balance of state.balances) {
      equity = equity.plus(toDecimal(balance.total));
      cash = cash.plus(toDecimal(balance.free));
    }

    const snapshot = new LivePortfolioSnapshotEntity();
    snapshot.accountId = accountId;
    snapshot.equity = equity.toString();
    snapshot.cash = cash.toString();
    snapshot.positionValue = '0';
    snapshot.realizedPnl = '0';
    return this.portfolios.append(snapshot);
  }
}
