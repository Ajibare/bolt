import { Injectable, NotFoundException } from '@nestjs/common';

import {
  PaperAccountRepository,
  PaperPortfolioRepository,
} from '../paper-trading/paper-trading.repository.js';
import {
  equityCurve,
  metricsFromCurve,
  type EquityCurvePoint,
  type PortfolioMetrics,
} from './portfolio-metrics.js';

/**
 * Portfolio performance report for one paper account, derived from the
 * immutable equity snapshots (AGENTS.md §13) plus live account state.
 * Computations are deterministic decimal math (AGENTS.md §14).
 */
export interface PortfolioAnalytics {
  accountId: string;
  startingCash: string;
  currentEquity: string;
  peakEquity: string;
  /** `(end - start) / start` as a decimal fraction (may be negative). */
  totalReturn: string;
  /** Most negative peak-to-trough drop as a decimal fraction (<= 0). */
  maxDrawdown: string;
  realizedPnl: string;
  /** Market value of open positions at the latest snapshot (0 = none). */
  lastPositionValue: string;
  equityCurve: EquityCurvePoint[];
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly accounts: PaperAccountRepository,
    private readonly portfolios: PaperPortfolioRepository,
  ) {}

  async portfolioAnalytics(
    userId: string,
    accountId: string,
  ): Promise<PortfolioAnalytics> {
    const account = await this.accounts.findByUserIdAndId(userId, accountId);
    if (!account) {
      throw new NotFoundException('Paper account not found');
    }

    const snapshots = await this.portfolios.listByAccount(accountId);
    const curve = equityCurve(snapshots);
    const metrics: PortfolioMetrics = metricsFromCurve(
      curve,
      account.startingCash,
    );
    const latest = snapshots[snapshots.length - 1] ?? null;

    return {
      accountId: account.id,
      startingCash: account.startingCash,
      currentEquity: metrics.endEquity,
      peakEquity: metrics.peakEquity,
      totalReturn: metrics.totalReturn,
      maxDrawdown: metrics.maxDrawdown,
      realizedPnl: account.realizedPnl,
      lastPositionValue: latest ? latest.positionValue : '0',
      equityCurve: curve,
    };
  }
}
