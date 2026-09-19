import { Injectable, NotFoundException } from '@nestjs/common';

import {
  PaperAccountRepository,
  PaperOrderRepository,
  PaperPortfolioRepository,
} from '../paper-trading/paper-trading.repository.js';
import type { PaperAccountEntity } from '../paper-trading/entities/paper-trading.entity.js';
import {
  equityCurve,
  metricsFromCurve,
  type EquityCurvePoint,
  type PortfolioMetrics,
} from './portfolio-metrics.js';
import { periodReturns, type PeriodReturn } from './performance-report.js';
import { performanceReportToCsv } from './performance-export.js';
import {
  reconstructTrades,
  summarizeTrades,
  type RoundTripTrade,
  type TradeMetrics,
} from './trade-metrics.js';

/** Max filled orders scanned when rebuilding FIFO trades. */
const ORDER_LOOKBACK_LIMIT = 5000;
/** Recent round trips returned alongside the aggregate metrics. */
const RECENT_TRADES_LIMIT = 50;

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

/** FIFO-reconstructed trade performance for one paper account. */
export interface TradeAnalytics {
  accountId: string;
  metrics: TradeMetrics;
  /** Most recent closed round trips first (bounded). */
  trades: RoundTripTrade[];
}

/** Per-period performance breakdown over the account equity curve. */
export interface PerformanceReport {
  accountId: string;
  portfolio: PortfolioAnalytics;
  trades: TradeAnalytics;
  periodReturns: {
    daily: PeriodReturn[];
    weekly: PeriodReturn[];
    monthly: PeriodReturn[];
  };
}

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly accounts: PaperAccountRepository,
    private readonly portfolios: PaperPortfolioRepository,
    private readonly orders: PaperOrderRepository,
  ) {}

  async portfolioAnalytics(
    userId: string,
    accountId: string,
  ): Promise<PortfolioAnalytics> {
    const account = await this.findAccount(userId, accountId);
    return this.portfolioFor(account);
  }

  /**
   * Rebuilds closed round-trip trades FIFO from the account's filled orders
   * and aggregates them. Ownership is enforced before any ledger read.
   */
  async tradeAnalytics(
    userId: string,
    accountId: string,
  ): Promise<TradeAnalytics> {
    const account = await this.findAccount(userId, accountId);
    return this.tradesFor(account);
  }

  /**
   * Single-payload performance report combining the portfolio metrics, the
   * FIFO trade metrics and per-period (day/week/month) equity returns.
   * Ownership is enforced once up front.
   */
  async performanceReport(
    userId: string,
    accountId: string,
  ): Promise<PerformanceReport> {
    const account = await this.findAccount(userId, accountId);
    const portfolio = await this.portfolioFor(account);
    const trades = await this.tradesFor(account);
    const curve = portfolio.equityCurve;

    return {
      accountId: account.id,
      portfolio,
      trades,
      periodReturns: {
        daily: periodReturns(curve, 'day'),
        weekly: periodReturns(curve, 'week'),
        monthly: periodReturns(curve, 'month'),
      },
    };
  }

  /**
   * Renders the performance report as a downloadable CSV (read-only). Reuses
   * the same ownership-scoped loaders as performanceReport.
   */
  async performanceReportCsv(
    userId: string,
    accountId: string,
  ): Promise<{ filename: string; csv: string }> {
    const report = await this.performanceReport(userId, accountId);
    return {
      filename: `performance-${report.accountId}.csv`,
      csv: performanceReportToCsv(report),
    };
  }

  private async findAccount(
    userId: string,
    accountId: string,
  ): Promise<PaperAccountEntity> {
    const account = await this.accounts.findByUserIdAndId(userId, accountId);
    if (!account) {
      throw new NotFoundException('Paper account not found');
    }
    return account;
  }

  private async portfolioFor(
    account: PaperAccountEntity,
  ): Promise<PortfolioAnalytics> {
    const snapshots = await this.portfolios.listByAccount(account.id);
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

  private async tradesFor(
    account: PaperAccountEntity,
  ): Promise<TradeAnalytics> {
    const orders = await this.orders.listFilledByAccount(
      account.id,
      ORDER_LOOKBACK_LIMIT,
    );
    const trades = reconstructTrades(orders);

    return {
      accountId: account.id,
      metrics: summarizeTrades(trades),
      trades: trades.slice(-RECENT_TRADES_LIMIT).reverse(),
    };
  }
}
