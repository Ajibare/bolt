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
  };
  const service = new AnalyticsService(
    accounts as never,
    portfolios as never,
    orders as never,
  );
  return { service, accounts, portfolios, orders };
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
