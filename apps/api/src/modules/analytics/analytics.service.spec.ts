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
  const service = new AnalyticsService(accounts as never, portfolios as never);
  return { service, accounts, portfolios };
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
