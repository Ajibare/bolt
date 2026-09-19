import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import {
  PaperAccountRepository,
  PaperOrderRepository,
  PaperPortfolioRepository,
} from '../paper-trading/paper-trading.repository.js';
import { toDecimal } from '@trading-bolt/shared';
import type { PaperAccountEntity } from '../paper-trading/entities/paper-trading.entity.js';
import { BotRepository } from '../bots/bot.repository.js';
import type { BotEntity } from '../bots/entities/bot.entity.js';
import {
  BrokersService,
  type LiveBrokerProvider,
} from '../brokers/brokers.service.js';
import { LivePortfolioRepository } from '../live-trading/live-portfolio.repository.js';
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

/** FIFO-reconstructed trade performance attributed to a single bot. */
export interface BotTradeAnalytics {
  botId: string;
  strategyId: string;
  symbol: string;
  metrics: TradeMetrics;
  /** Most recent closed round trips first (bounded). */
  trades: RoundTripTrade[];
}

/** FIFO-reconstructed trade performance rolled up across the user's bots. */
export interface StrategyTradeAnalytics {
  strategyId: string;
  /** Bots of the requesting user running this strategy. */
  botIds: string[];
  /** Distinct symbols traded across those bots. */
  symbols: string[];
  metrics: TradeMetrics;
  /** Most recent closed round trips first (bounded). */
  trades: RoundTripTrade[];
}

/** One row of the strategy-vs-strategy comparison — the FIFO trade metrics
 * for a single strategy (the same engine as `strategyTradeAnalytics`). */
export interface StrategyComparisonItem {
  strategyId: string;
  botIds: string[];
  symbols: string[];
  metrics: TradeMetrics;
}

/** Head-to-head view across every strategy the requesting user runs. */
export interface StrategyComparison {
  /** Highest net P&L first (ties broken by strategy id, so ordering is
   * deterministic across requests). */
  strategies: StrategyComparisonItem[];
}

/** FIFO-reconstructed trade performance over the live broker fills. */
export interface LiveTradeAnalytics {
  accountId: string;
  /** Active live provider the fills were dispatched through. */
  provider: LiveBrokerProvider;
  environment: 'demo' | 'testnet' | 'mainnet';
  metrics: TradeMetrics;
  /** Most recent closed round trips first (bounded). */
  trades: RoundTripTrade[];
}

/**
 * Live-account portfolio performance derived from the broker-observed equity
 * snapshots only. Unlike the paper curve, position value and realized P&L are
 * not yet derivable from spot balances, so they report `'0'`; every other
 * field is honest broker-observed data.
 */
export interface LivePortfolioAnalytics {
  accountId: string;
  /** Cash reported in the earliest snapshot (first observed baseline). */
  startingCash: string;
  currentEquity: string;
  peakEquity: string;
  /** `(end - start) / start` as a decimal fraction (may be negative). */
  totalReturn: string;
  /** Most negative peak-to-trough drop as a decimal fraction (<= 0). */
  maxDrawdown: string;
  realizedPnl: string;
  lastPositionValue: string;
  equityCurve: EquityCurvePoint[];
}

/** Per-period performance breakdown over the account equity curve. */
export interface PerformanceReport {
  accountId: string;
  portfolio: PortfolioAnalytics;
  trades: TradeAnalytics;
  periodReturns: {
    hourly: PeriodReturn[];
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
    private readonly bots: BotRepository,
    private readonly brokers: BrokersService,
    private readonly livePortfolio: LivePortfolioRepository,
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
   * Rebuilds closed round-trip trades FIFO from the orders one bot placed on
   * its paper account and aggregates them. Ownership is enforced before any
   * ledger read; orders created before bot attribution exist in the ledger
   * but simply do not match the bot (they were backfilled where possible).
   */
  async botTradeAnalytics(
    userId: string,
    botId: string,
  ): Promise<BotTradeAnalytics> {
    const bot = await this.bots.findByUserIdAndId(userId, botId);
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    const orders = await this.orders.listFilledByAccountAndBot(
      bot.paperAccountId,
      bot.id,
      ORDER_LOOKBACK_LIMIT,
    );
    const trades = reconstructTrades(orders);

    return {
      botId: bot.id,
      strategyId: bot.strategyId,
      symbol: bot.symbol,
      metrics: summarizeTrades(trades),
      trades: trades.slice(-RECENT_TRADES_LIMIT).reverse(),
    };
  }

  /**
   * Rolls FIFO round trips up across every bot of the requesting user that
   * runs the given strategy. Ownership is derived server-side from the user's
   * own bots (AGENTS.md §23) — the strategy id alone is never trusted.
   */
  async strategyTradeAnalytics(
    userId: string,
    strategyId: string,
  ): Promise<StrategyTradeAnalytics> {
    const mine = await this.bots.listByUserId(userId);
    const bots = mine.filter((bot) => bot.strategyId === strategyId);
    if (bots.length === 0) {
      throw new NotFoundException('No bots run this strategy for the user');
    }
    const { botIds, symbols, metrics, trades } =
      await this.strategyAggregate(bots);

    return {
      strategyId,
      botIds,
      symbols,
      metrics,
      trades: trades.slice(-RECENT_TRADES_LIMIT).reverse(),
    };
  }

  /**
   * Strategy-vs-strategy comparison: one FIFO summary per strategy the
   * requesting user runs, sorted by net P&L (ties by strategy id) so the view
   * is deterministic. Every bot set is derived server-side from the user's own
   * bots — cross-user data can never leak in (AGENTS.md §23).
   */
  async strategyComparisonAnalytics(
    userId: string,
  ): Promise<StrategyComparison> {
    const mine = await this.bots.listByUserId(userId);

    const byStrategy = new Map<string, BotEntity[]>();
    for (const bot of mine) {
      const list = byStrategy.get(bot.strategyId) ?? [];
      list.push(bot);
      byStrategy.set(bot.strategyId, list);
    }

    const strategies: StrategyComparisonItem[] = [];
    for (const [strategyId, bots] of byStrategy) {
      const { botIds, symbols, metrics } = await this.strategyAggregate(bots);
      strategies.push({ strategyId, botIds, symbols, metrics });
    }

    strategies.sort((a, b) => {
      const diff = toDecimal(b.metrics.netPnl).minus(
        toDecimal(a.metrics.netPnl),
      );
      if (!diff.isZero()) {
        return diff.isNegative() ? -1 : 1;
      }
      return a.strategyId.localeCompare(b.strategyId);
    });

    return { strategies };
  }

  /**
   * FIFO aggregate across a server-derived set of the user's own bots,
   * shared by the per-strategy and comparison endpoints.
   */
  private async strategyAggregate(bots: BotEntity[]): Promise<{
    botIds: string[];
    symbols: string[];
    metrics: TradeMetrics;
    trades: RoundTripTrade[];
  }> {
    const botIds = bots.map((bot) => bot.id);
    const orders = await this.orders.listFilledByBotIds(
      botIds,
      ORDER_LOOKBACK_LIMIT,
    );
    const trades = reconstructTrades(orders);
    return {
      botIds,
      symbols: [...new Set(bots.map((bot) => bot.symbol))],
      metrics: summarizeTrades(trades),
      trades,
    };
  }

  /**
   * Rebuilds FIFO round trips from the account's live-broker fills (the
   * active provider's rows only — paper fills are excluded) and aggregates
   * them, mirroring the paper account trade analytics. Ownership is enforced
   * before any ledger read and the provider is resolved server-side.
   */
  async liveTradeAnalytics(
    userId: string,
    accountId: string,
  ): Promise<LiveTradeAnalytics> {
    const account = await this.findAccount(userId, accountId);
    const provider = this.brokers.provider();
    if (!provider) {
      throw new BadRequestException('Live broker not configured');
    }
    const orders = await this.orders.listFilledByAccountAndProvider(
      account.id,
      provider,
      ORDER_LOOKBACK_LIMIT,
    );
    const trades = reconstructTrades(orders);

    return {
      accountId: account.id,
      provider,
      environment: this.brokers.environment(),
      metrics: summarizeTrades(trades),
      trades: trades.slice(-RECENT_TRADES_LIMIT).reverse(),
    };
  }

  /**
   * Rebuilds the live-account equity curve and metrics from the broker-observed
   * portfolio snapshots, mirroring `portfolioAnalytics` for paper accounts.
   * Ownership is enforced before any snapshot read; the endpoint 400s when no
   * live broker is configured (there can be no snapshots to report).
   */
  async livePortfolioAnalytics(
    userId: string,
    accountId: string,
  ): Promise<LivePortfolioAnalytics> {
    const account = await this.findAccount(userId, accountId);
    if (!this.brokers.provider()) {
      throw new BadRequestException('Live broker not configured');
    }
    const snapshots = await this.livePortfolio.listByAccount(account.id);
    const curve = equityCurve(snapshots);
    const metrics: PortfolioMetrics = metricsFromCurve(curve, '0');
    const latest = snapshots[snapshots.length - 1] ?? null;

    return {
      accountId: account.id,
      startingCash: snapshots[0]?.cash ?? '0',
      currentEquity: metrics.endEquity,
      peakEquity: metrics.peakEquity,
      totalReturn: metrics.totalReturn,
      maxDrawdown: metrics.maxDrawdown,
      realizedPnl: '0',
      lastPositionValue: latest ? latest.positionValue : '0',
      equityCurve: curve,
    };
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
        hourly: periodReturns(curve, 'hour'),
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
