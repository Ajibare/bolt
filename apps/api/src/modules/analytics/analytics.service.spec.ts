import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import {
  PaperAccountEntity,
  PaperPortfolioSnapshotEntity,
} from '../paper-trading/entities/paper-trading.entity.js';
import { AnalyticsService } from './analytics.service.js';

function makeService() {
  const accounts = {
    findByUserIdAndId: vi.fn(),
  };
  const portfolios = {
    listByAccount: vi.fn(),
  };
  const orders = {
    listFilledByAccount: vi.fn(),
    listFilledByAccountAndBot: vi.fn(),
  };
  const bots = {
    findByUserIdAndId: vi.fn(),
  };
  const service = new AnalyticsService(
    accounts as never,
    portfolios as never,
    orders as never,
    bots as never,
  );
  return { service, accounts, portfolios, orders, bots };
}

function accountFor(
  overrides: Partial<PaperAccountEntity> = {},
): PaperAccountEntity {
  return {
    id: 'acc-1',
    userId: 'user-1',
    name: 'Test',
    status: 'ACTIVE',
    startingCash: '1000',
    freeCash: '400',
    realizedPnl: '60',
    totalFeesPaid: '2',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

function snapshotFor(
  overrides: Partial<PaperPortfolioSnapshotEntity> = {},
): PaperPortfolioSnapshotEntity {
  return {
    id: 'snap-1',
    accountId: 'acc-1',
    equity: '1000',
    cash: '700',
    positionValue: '300',
    realizedPnl: '0',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('AnalyticsService.portfolioAnalytics', () => {
  it('rejects an account that does not belong to the requesting user', async () => {
    const { service, accounts } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(null);

    await expect(
      service.portfolioAnalytics('user-1', 'acc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('scopes the ownership lookup to the authenticated user id', async () => {
    const { service, accounts, portfolios } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(accountFor());
    portfolios.listByAccount.mockResolvedValue([]);

    await service.portfolioAnalytics('user-1', 'acc-1');
    expect(accounts.findByUserIdAndId).toHaveBeenCalledWith('user-1', 'acc-1');
  });

  it('reports the curve and metrics for an account with snapshots', async () => {
    const { service, accounts, portfolios } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(accountFor());
    portfolios.listByAccount.mockResolvedValue([
      snapshotFor({
        id: 'snap-1',
        equity: '1000',
        positionValue: '300',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      snapshotFor({
        id: 'snap-2',
        equity: '1100',
        positionValue: '400',
        realizedPnl: '40',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
    ]);

    const result = await service.portfolioAnalytics('user-1', 'acc-1');

    expect(result.accountId).toBe('acc-1');
    expect(result.startingCash).toBe('1000');
    expect(result.currentEquity).toBe('1100');
    expect(result.peakEquity).toBe('1100');
    expect(result.totalReturn).toBe('0.10000000');
    expect(result.maxDrawdown).toBe('0.00000000');
    expect(result.realizedPnl).toBe('60');
    expect(result.lastPositionValue).toBe('400');
    expect(result.equityCurve).toEqual([
      { timestamp: new Date('2026-01-01T00:00:00Z').getTime(), equity: '1000' },
      { timestamp: new Date('2026-01-02T00:00:00Z').getTime(), equity: '1100' },
    ]);
  });

  it('falls back to account state when no snapshot exists yet', async () => {
    const { service, accounts, portfolios } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(accountFor());
    portfolios.listByAccount.mockResolvedValue([]);

    const result = await service.portfolioAnalytics('user-1', 'acc-1');

    expect(result.currentEquity).toBe('1000');
    expect(result.peakEquity).toBe('1000');
    expect(result.totalReturn).toBe('0.00000000');
    expect(result.maxDrawdown).toBe('0.00000000');
    expect(result.lastPositionValue).toBe('0');
    expect(result.equityCurve).toEqual([]);
  });
});

describe('AnalyticsService.tradeAnalytics', () => {
  function filledOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      accountId: 'acc-1',
      clientOrderId: 'c-1',
      brokerOrderId: null,
      provider: 'paper',
      brokerStatus: null,
      bracketOrderListId: null,
      lastSyncedAt: null,
      side: 'buy',
      type: 'market',
      symbol: 'BTCUSDT',
      quantity: '1',
      price: null,
      stopLoss: null,
      takeProfit: null,
      reduceOnly: false,
      feeRate: '0',
      slippageRate: '0',
      status: 'FILLED',
      filledQuantity: '1',
      avgFillPrice: '100',
      fees: '0',
      reason: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  it('rejects an account that does not belong to the requesting user', async () => {
    const { service, accounts, orders } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(null);

    await expect(
      service.tradeAnalytics('user-1', 'acc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(orders.listFilledByAccount).not.toHaveBeenCalled();
  });

  it('rebuilds FIFO round trips and aggregates them', async () => {
    const { service, accounts, orders } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(accountFor());
    orders.listFilledByAccount.mockResolvedValue([
      filledOrder({ side: 'buy', filledQuantity: '1', avgFillPrice: '100' }),
      filledOrder({
        id: 'order-2',
        side: 'sell',
        filledQuantity: '1',
        avgFillPrice: '110',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
    ]);

    const result = await service.tradeAnalytics('user-1', 'acc-1');

    expect(orders.listFilledByAccount).toHaveBeenCalledWith('acc-1', 5000);
    expect(result.accountId).toBe('acc-1');
    expect(result.metrics.tradeCount).toBe(1);
    expect(result.metrics.winCount).toBe(1);
    expect(result.metrics.netPnl).toBe('10.00000000');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].direction).toBe('long');
    expect(result.trades[0].exitPrice).toBe('110');
  });

  it('returns empty metrics when the account has no filled orders', async () => {
    const { service, accounts, orders } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(accountFor());
    orders.listFilledByAccount.mockResolvedValue([]);

    const result = await service.tradeAnalytics('user-1', 'acc-1');

    expect(result.metrics.tradeCount).toBe(0);
    expect(result.metrics.profitFactor).toBeNull();
    expect(result.trades).toEqual([]);
  });
});

describe('AnalyticsService.botTradeAnalytics', () => {
  function botFor(overrides: Record<string, unknown> = {}) {
    return {
      id: 'bot-1',
      userId: 'user-1',
      name: 'TestBot',
      strategyId: 'sma-crossover',
      config: {},
      symbol: 'BTCUSDT',
      interval: '1m',
      riskConfig: {},
      paperAccountId: 'acc-1',
      executionMode: 'PAPER',
      status: 'RUNNING',
      quantity: '1',
      stopLossPercent: '0.02',
      takeProfitPercent: null,
      lastSignalDirection: null,
      lastSignalReason: null,
      lastSignalAt: null,
      lastOrderId: null,
      lastOrderStatus: null,
      lastOrderSymbol: null,
      lastError: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  function filledOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      accountId: 'acc-1',
      clientOrderId: 'c-1',
      brokerOrderId: null,
      provider: 'paper',
      brokerStatus: null,
      bracketOrderListId: null,
      lastSyncedAt: null,
      botId: 'bot-1',
      botRunId: null,
      side: 'buy',
      type: 'market',
      symbol: 'BTCUSDT',
      quantity: '1',
      price: null,
      stopLoss: null,
      takeProfit: null,
      reduceOnly: false,
      feeRate: '0',
      slippageRate: '0',
      status: 'FILLED',
      filledQuantity: '1',
      avgFillPrice: '100',
      fees: '0',
      reason: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  it('rejects a bot that does not belong to the requesting user', async () => {
    const { service, bots, orders } = makeService();
    bots.findByUserIdAndId.mockResolvedValue(null);

    await expect(
      service.botTradeAnalytics('user-1', 'bot-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(orders.listFilledByAccountAndBot).not.toHaveBeenCalled();
  });

  it('scopes the ownership lookup to the authenticated user id', async () => {
    const { service, bots, orders } = makeService();
    bots.findByUserIdAndId.mockResolvedValue(botFor());
    orders.listFilledByAccountAndBot.mockResolvedValue([]);

    await service.botTradeAnalytics('user-1', 'bot-1');
    expect(bots.findByUserIdAndId).toHaveBeenCalledWith('user-1', 'bot-1');
  });

  it('rebuilds FIFO round trips from the bot orders alone', async () => {
    const { service, bots, orders } = makeService();
    bots.findByUserIdAndId.mockResolvedValue(botFor());
    orders.listFilledByAccountAndBot.mockResolvedValue([
      filledOrder({ side: 'buy', filledQuantity: '1', avgFillPrice: '100' }),
      filledOrder({
        id: 'order-2',
        side: 'sell',
        filledQuantity: '1',
        avgFillPrice: '110',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
    ]);

    const result = await service.botTradeAnalytics('user-1', 'bot-1');

    expect(orders.listFilledByAccountAndBot).toHaveBeenCalledWith(
      'acc-1',
      'bot-1',
      5000,
    );
    expect(result.botId).toBe('bot-1');
    expect(result.strategyId).toBe('sma-crossover');
    expect(result.symbol).toBe('BTCUSDT');
    expect(result.metrics.tradeCount).toBe(1);
    expect(result.metrics.winCount).toBe(1);
    expect(result.metrics.netPnl).toBe('10.00000000');
    expect(result.trades).toHaveLength(1);
    expect(result.trades[0].direction).toBe('long');
  });
});

describe('AnalyticsService.performanceReport', () => {
  function filledOrder(overrides: Record<string, unknown> = {}) {
    return {
      id: 'order-1',
      accountId: 'acc-1',
      clientOrderId: 'c-1',
      brokerOrderId: null,
      provider: 'paper',
      brokerStatus: null,
      bracketOrderListId: null,
      lastSyncedAt: null,
      side: 'buy',
      type: 'market',
      symbol: 'BTCUSDT',
      quantity: '1',
      price: null,
      stopLoss: null,
      takeProfit: null,
      reduceOnly: false,
      feeRate: '0',
      slippageRate: '0',
      status: 'FILLED',
      filledQuantity: '1',
      avgFillPrice: '100',
      fees: '0',
      reason: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      updatedAt: new Date('2026-01-01T00:00:00Z'),
      ...overrides,
    };
  }

  it('rejects an account that does not belong to the requesting user', async () => {
    const { service, accounts, portfolios, orders } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(null);

    await expect(
      service.performanceReport('user-1', 'acc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(portfolios.listByAccount).not.toHaveBeenCalled();
    expect(orders.listFilledByAccount).not.toHaveBeenCalled();
  });

  it('combines portfolio + trade metrics with daily period returns', async () => {
    const { service, accounts, portfolios, orders } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(accountFor());
    portfolios.listByAccount.mockResolvedValue([
      snapshotFor({
        equity: '1000',
        positionValue: '300',
        createdAt: new Date('2026-01-01T09:00:00Z'),
      }),
      snapshotFor({
        id: 'snap-2',
        equity: '1100',
        positionValue: '400',
        realizedPnl: '60',
        createdAt: new Date('2026-01-02T09:00:00Z'),
      }),
    ]);
    orders.listFilledByAccount.mockResolvedValue([
      filledOrder({ side: 'buy', filledQuantity: '1', avgFillPrice: '100' }),
      filledOrder({
        id: 'order-2',
        side: 'sell',
        filledQuantity: '1',
        avgFillPrice: '110',
        createdAt: new Date('2026-01-02T00:00:00Z'),
      }),
    ]);

    const result = await service.performanceReport('user-1', 'acc-1');

    expect(result.accountId).toBe('acc-1');
    expect(result.portfolio.currentEquity).toBe('1100');
    expect(result.portfolio.totalReturn).toBe('0.10000000');
    expect(result.trades.metrics.tradeCount).toBe(1);
    expect(result.trades.metrics.netPnl).toBe('10.00000000');

    expect(result.periodReturns.daily).toHaveLength(2);
    expect(result.periodReturns.daily[0]).toMatchObject({
      label: '2026-01-01',
      startingEquity: '1000',
      endingEquity: '1000',
      returnPercent: '0.00000000',
    });
    expect(result.periodReturns.daily[1]).toMatchObject({
      label: '2026-01-02',
      startingEquity: '1000',
      endingEquity: '1100',
      returnPercent: '0.10000000',
    });
    expect(result.periodReturns.weekly[0].endingEquity).toBe('1100');
    expect(result.periodReturns.monthly[0].endingEquity).toBe('1100');
  });
});

describe('AnalyticsService.performanceReportCsv', () => {
  it('rejects an account that does not belong to the requesting user', async () => {
    const { service, accounts, portfolios, orders } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(null);

    await expect(
      service.performanceReportCsv('user-1', 'acc-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(portfolios.listByAccount).not.toHaveBeenCalled();
    expect(orders.listFilledByAccount).not.toHaveBeenCalled();
  });

  it('renders the report as a CSV with a stable filename', async () => {
    const { service, accounts, portfolios, orders } = makeService();
    accounts.findByUserIdAndId.mockResolvedValue(accountFor());
    portfolios.listByAccount.mockResolvedValue([
      snapshotFor({
        equity: '1000',
        positionValue: '300',
        createdAt: new Date('2026-01-01T09:00:00Z'),
      }),
      snapshotFor({
        id: 'snap-2',
        equity: '1100',
        positionValue: '400',
        realizedPnl: '60',
        createdAt: new Date('2026-01-02T09:00:00Z'),
      }),
    ]);
    orders.listFilledByAccount.mockResolvedValue([]);

    const result = await service.performanceReportCsv('user-1', 'acc-1');

    expect(result.filename).toBe('performance-acc-1.csv');
    const lines = result.csv.trim().split('\n');
    expect(lines[0]).toBe('metric,value');
    expect(lines).toContain('equity,1100');
    expect(lines).toContain('trades,0');
    expect(lines).toContain('day,2026-01-01,1000,1000,0.00000000,0.00000000,1');
    expect(lines).toContain(
      'day,2026-01-02,1000,1100,0.10000000,100.00000000,1',
    );
    expect(lines[lines.length - 1]).toBe(
      'month,2026-01,1000,1100,0.10000000,100.00000000,2',
    );
  });
});
