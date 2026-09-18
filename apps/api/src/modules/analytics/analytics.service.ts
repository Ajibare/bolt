import { Injectable, NotFoundException } from '@nestjs/common';

import {
  PaperAccountRepository,
  PaperOrderRepository,
  PaperPortfolioRepository,
} from '../paper-trading/paper-trading.repository.js';
import {
  equityCurve,
  metricsFromCurve,
  type EquityCurvePoint,
  type PortfolioMetrics,
} from './portfolio-metrics.js';
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

  /**
   * Rebuilds closed round-trip trades FIFO from the account's filled orders
   * and aggregates them. Ownership is enforced before any ledger read.
   */
  async tradeAnalytics(
    userId: string,
    accountId: string,
  ): Promise<TradeAnalytics> {
    const account = await this.accounts.findByUserIdAndId(userId, accountId);
    if (!account) {
      throw new NotFoundException('Paper account not found');
    }

    const orders = await this.orders.listFilledByAccount(
      accountId,
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
