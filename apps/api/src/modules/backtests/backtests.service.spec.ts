import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Candle, Money } from '@trading-bolt/shared';
import {
  createStrategy,
  runBacktest,
  SMA_CROSSOVER_ID,
} from '@trading-bolt/trading-engine';
import { BacktestRepository } from './backtest.repository.js';
import { PersistBacktestInput } from './backtest.mapper.js';
import { BacktestsService } from './backtests.service.js';
import { RunBacktestDto } from './dto/run-backtest.dto.js';
import { BacktestEntity } from './entities/backtest.entity.js';

function candles(closes: string[]): Candle[] {
  const start = 1_700_000_000_000;
  return closes.map((close, index) => ({
    symbol: 'BTCUSDT',
    interval: '15m',
    timestamp: start + index * 600_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: '1000',
  }));
}

function createService() {
  const saveMock = vi
    .fn()
    .mockImplementation(async (entity: BacktestEntity) => ({
      ...entity,
      id: 'bt-1',
    }));
  const repository = {
    save: saveMock,
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  } as unknown as BacktestRepository;
  const marketsService = {
    getCandles: vi.fn().mockResolvedValue(candles(['100', '90', '80', '100'])),
  };
  return {
    service: new BacktestsService(repository, marketsService as never),
    repository,
    saveMock,
    marketsService,
  };
}

function persistInput(): PersistBacktestInput {
  const strategy = createStrategy(SMA_CROSSOVER_ID, {
    kind: SMA_CROSSOVER_ID,
    fastPeriod: 2,
    slowPeriod: 3,
  });
  const result = runBacktest({
    strategy,
    candles: candles(['100', '90', '80', '100', '90', '100']),
    startingBalance: '10000' as Money,
    feeRate: '0',
    slippageRate: '0',
  });
  return {
    strategyId: SMA_CROSSOVER_ID,
    config: { kind: SMA_CROSSOVER_ID, fastPeriod: 2, slowPeriod: 3 },
    symbol: 'BTCUSDT',
    interval: '15m',
    candleLimit: 200,
    feeRate: '0' as Money,
    slippageRate: '0' as Money,
    positionSize: '1' as Money,
    allowShort: false,
    riskFreeRate: '0' as Money,
    result,
  };
}

describe('BacktestsService', () => {
  it('stores a mapped backtest with cascading trades and equity points', async () => {
    const { service, repository } = createService();
    const stored = await service.store(persistInput());

    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(stored.id).toBe('bt-1');
    expect(stored.strategyId).toBe(SMA_CROSSOVER_ID);
    expect(stored.symbol).toBe('BTCUSDT');
    expect(stored.interval).toBe('15m');
    expect(stored.allowShort).toBe(false);
    expect(stored.netProfit).toBe('1111.11');
    expect(stored.closedTrades).toBe(1);
    expect(stored.winningTrades).toBe(1);
    expect(stored.totalFeesPaid).toBe('0.00');
    expect(stored.trades).toHaveLength(2);
    expect(stored.trades[0].seq).toBe(0);
    expect(stored.trades[0].side).toBe('buy');
    expect(stored.trades[0].realizedPnl).toBeNull();
    expect(stored.trades[1].seq).toBe(1);
    expect(stored.trades[1].side).toBe('sell');
    expect(stored.trades[1].realizedPnl).toBe('1111.11');
    expect(stored.equityPoints).toHaveLength(6);
    expect(stored.equityPoints.map((p) => p.seq)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(stored.equityPoints[5].equity).toBe('11111.11');
  });

  it('finds a backtest by id through the repository', async () => {
    const { service, repository } = createService();
    repository.findById = vi.fn().mockResolvedValue({ id: 'bt-1' });
    const found = await service.findById('bt-1');
    expect(repository.findById).toHaveBeenCalledWith('bt-1');
    expect(found?.id).toBe('bt-1');
  });

  it('lists backtests newest-first with a default limit', async () => {
    const { service, repository } = createService();
    await service.list();
    expect(repository.list).toHaveBeenCalledWith(50);
  });
});

describe('BacktestsService.run', () => {
  const dto: RunBacktestDto = {
    strategyId: SMA_CROSSOVER_ID,
    symbol: 'BTCUSDT',
    interval: '15m',
    config: { kind: SMA_CROSSOVER_ID, fastPeriod: 2, slowPeriod: 3 },
    limit: 200,
    startingBalance: '10000',
    feeRate: '0',
    slippageRate: '0',
    positionSize: '1',
    allowShort: false,
    riskFreeRate: '0',
  };

  it('fetches candles, runs the engine and persists the report', async () => {
    const { service, marketsService, repository } = createService();
    marketsService.getCandles.mockResolvedValue(
      candles(['100', '90', '80', '100', '90', '100']),
    );

    const stored = await service.run(dto);

    expect(marketsService.getCandles).toHaveBeenCalledWith(
      'BTCUSDT',
      '15m',
      200,
    );
    expect(repository.save).toHaveBeenCalledTimes(1);
    expect(stored.strategyId).toBe(SMA_CROSSOVER_ID);
    expect(stored.netProfit).toBe('1111.11');
    expect(stored.trades[0].side).toBe('buy');
    expect(stored.trades[1].side).toBe('sell');
  });

  it('uses the resolved candle count as the stored candleLimit', async () => {
    const { service, marketsService, saveMock } = createService();
    marketsService.getCandles.mockResolvedValue(candles(['100', '90', '80']));

    await service.run({ ...dto, limit: undefined });

    const saved = saveMock.mock.calls[0][0] as BacktestEntity;
    expect(saved.candleLimit).toBe(3);
  });

  it('maps an unknown strategy to NotFoundException', async () => {
    const { service } = createService();
    await expect(
      service.run({ ...dto, strategyId: 'nope' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('maps an invalid strategy config to BadRequestException', async () => {
    const { service } = createService();
    await expect(
      service.run({
        ...dto,
        config: { kind: SMA_CROSSOVER_ID, fastPeriod: 5, slowPeriod: 2 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('maps engine input errors to BadRequestException', async () => {
    const { service } = createService();
    await expect(
      service.run({ ...dto, startingBalance: '0' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('propagates candles fetch failures unchanged', async () => {
    const { service, marketsService } = createService();
    marketsService.getCandles.mockRejectedValue(new Error('provider down'));
    await expect(service.run(dto)).rejects.toThrow('provider down');
  });
});
