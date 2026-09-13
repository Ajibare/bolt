import { describe, expect, it, vi } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { Candle } from '@trading-bolt/shared';
import {
  RSI_MEAN_REVERSION_ID,
  SMA_CROSSOVER_ID,
} from '@trading-bolt/trading-engine';
import { MarketsService } from '../markets/markets.service.js';
import { StrategiesService } from './strategies.service.js';

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

function createService(getCandles = vi.fn().mockResolvedValue([])) {
  const marketsService = { getCandles } as unknown as MarketsService;
  return {
    service: new StrategiesService(marketsService),
    marketsService,
    getCandles,
  };
}

const bullishSeries = candles(['100', '102', '104', '103', '102', '130']);

const validSmaConfig = {
  kind: SMA_CROSSOVER_ID,
  fastPeriod: 2,
  slowPeriod: 3,
};

describe('StrategiesService', () => {
  it('lists the registered strategies without exposing config schemas', () => {
    const { service } = createService();
    const strategies = service.listStrategies();

    expect(strategies).toHaveLength(2);
    expect(strategies.map((s) => s.id)).toEqual(
      expect.arrayContaining([SMA_CROSSOVER_ID, RSI_MEAN_REVERSION_ID]),
    );
    for (const strategy of strategies) {
      expect(strategy.id).toBeTruthy();
      expect(strategy.name).toBeTruthy();
      expect(strategy.description).toBeTruthy();
    }
  });

  it('evaluates a strategy against market candles, returning the signal', async () => {
    const { service, getCandles } = createService(
      vi.fn().mockResolvedValue(bullishSeries),
    );

    const result = await service.evaluate({
      strategyId: SMA_CROSSOVER_ID,
      symbol: 'BTCUSDT',
      interval: '15m',
      config: validSmaConfig,
    });

    expect(getCandles).toHaveBeenCalledWith('BTCUSDT', '15m', undefined);
    expect(result.candleCount).toBe(6);
    expect(result.signal.direction).toBe('buy');
    expect(result.signal.strategyId).toBe(SMA_CROSSOVER_ID);
    expect(result.signal.symbol).toBe('BTCUSDT');
    expect(result.signal.timestamp).toBe(bullishSeries[5].timestamp);
  });

  it('forwards a limit to candle loading', async () => {
    const { service, getCandles } = createService(
      vi.fn().mockResolvedValue(bullishSeries),
    );
    await service.evaluate({
      strategyId: SMA_CROSSOVER_ID,
      symbol: 'BTCUSDT',
      interval: '1h',
      config: validSmaConfig,
      limit: 50,
    });
    expect(getCandles).toHaveBeenCalledWith('BTCUSDT', '1h', 50);
  });

  it('rejects an unknown strategy id with 404', async () => {
    const { service } = createService(vi.fn().mockResolvedValue(bullishSeries));
    await expect(
      service.evaluate({
        strategyId: 'no-such-strategy',
        symbol: 'BTCUSDT',
        interval: '15m',
        config: {},
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects config that fails the strategy zod schema with 400', async () => {
    const { service } = createService(vi.fn().mockResolvedValue(bullishSeries));
    await expect(
      service.evaluate({
        strategyId: SMA_CROSSOVER_ID,
        symbol: 'BTCUSDT',
        interval: '15m',
        config: { kind: SMA_CROSSOVER_ID, fastPeriod: 5, slowPeriod: 4 },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
