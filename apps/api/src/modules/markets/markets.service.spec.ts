import { describe, expect, it, vi } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import type { Candle } from '@trading-bolt/shared';
import type { MarketCandleEntity } from './market-candle.entity.js';
import type { MarketCandleRepository } from './market-candle.repository.js';
import type { MarketDataProvider } from './market-data.provider.js';
import { MarketsService } from './markets.service.js';

const HOUR_MS = 3_600_000;

function entity(
  overrides: Partial<MarketCandleEntity> = {},
): MarketCandleEntity {
  return {
    id: '550e8400-e29b-41d4-a716-446655440000',
    symbol: 'BTCUSDT',
    interval: '1h',
    timestamp: Date.now() - 60_000,
    open: '1',
    high: '2',
    low: '0.5',
    close: '1.5',
    volume: '10',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function candle(overrides: Partial<Candle> = {}): Candle {
  return {
    symbol: 'BTCUSDT',
    interval: '1h',
    timestamp: entity().timestamp,
    open: '1',
    high: '2',
    low: '0.5',
    close: '1.5',
    volume: '10',
    ...overrides,
  };
}

function createRepository(
  overrides: Partial<MarketCandleRepository> = {},
): MarketCandleRepository {
  return {
    findLatest: vi.fn().mockResolvedValue([]),
    upsertCandles: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as MarketCandleRepository;
}

function createService(
  provider: Partial<MarketDataProvider> = {},
  repository: MarketCandleRepository = createRepository(),
) {
  return new MarketsService(provider as never, repository as never);
}

describe('MarketsService', () => {
  it("returns the provider's supported symbols", () => {
    const service = createService({ getSymbols: () => ['BTCUSDT', 'ETHUSDT'] });
    expect(service.getSymbols()).toEqual(['BTCUSDT', 'ETHUSDT']);
  });

  it('fetches candles for a valid symbol, normalizing case', async () => {
    const getCandles = vi.fn().mockResolvedValue([]);
    const service = createService({
      getSymbols: () => ['BTCUSDT'],
      getCandles,
    });

    await service.getCandles('btcusdt', '15m', 10);

    expect(getCandles).toHaveBeenCalledWith('BTCUSDT', {
      interval: '15m',
      limit: 10,
    });
  });

  it('rejects an unsupported symbol before touching provider or store', async () => {
    const getCandles = vi.fn();
    const findLatest = vi.fn();
    const service = createService(
      { getSymbols: () => ['BTCUSDT'], getCandles },
      createRepository({ findLatest }),
    );

    await expect(service.getCandles('DOGEUSDT', '1h')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(getCandles).not.toHaveBeenCalled();
    expect(findLatest).not.toHaveBeenCalled();
  });

  it('rejects an unsupported interval', async () => {
    const service = createService({
      getSymbols: () => ['BTCUSDT'],
      getCandles: vi.fn(),
    });

    await expect(
      service.getCandles('BTCUSDT', '7d' as never),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('uses the default limit when none is provided', async () => {
    const getCandles = vi.fn().mockResolvedValue([]);
    const service = createService({
      getSymbols: () => ['BTCUSDT'],
      getCandles,
    });

    await service.getCandles('BTCUSDT', '1h');
    expect(getCandles).toHaveBeenCalledWith('BTCUSDT', {
      interval: '1h',
      limit: 100,
    });
  });

  it('clamps limits to the allowed range', async () => {
    const getCandles = vi.fn().mockResolvedValue([]);
    const service = createService({
      getSymbols: () => ['BTCUSDT'],
      getCandles,
    });

    await service.getCandles('BTCUSDT', '1h', 9999);
    expect(getCandles).toHaveBeenCalledWith('BTCUSDT', {
      interval: '1h',
      limit: 200,
    });

    await service.getCandles('BTCUSDT', '1h', 0);
    expect(getCandles).toHaveBeenCalledWith('BTCUSDT', {
      interval: '1h',
      limit: 1,
    });
  });

  it('serves fresh persisted candles without hitting the provider', async () => {
    const fresh = entity();
    const getCandles = vi.fn();
    const upsertCandles = vi.fn();
    const repository = createRepository({
      findLatest: vi.fn().mockResolvedValue([fresh]),
      upsertCandles,
    });
    const service = createService(
      { getSymbols: () => ['BTCUSDT'], getCandles },
      repository,
    );

    const result = await service.getCandles('BTCUSDT', '1h');

    expect(result).toEqual([
      {
        symbol: fresh.symbol,
        interval: fresh.interval,
        timestamp: fresh.timestamp,
        open: fresh.open,
        high: fresh.high,
        low: fresh.low,
        close: fresh.close,
        volume: fresh.volume,
      },
    ]);
    expect(getCandles).not.toHaveBeenCalled();
    expect(upsertCandles).not.toHaveBeenCalled();
    expect(repository.findLatest).toHaveBeenCalledTimes(1);
  });

  it('refreshes from the provider and persists when the store is stale', async () => {
    const stale = entity({ timestamp: Date.now() - 3 * HOUR_MS });
    const persisted = [entity({ timestamp: Date.now() - HOUR_MS })];
    const fetched = candle();
    const getCandles = vi.fn().mockResolvedValue([fetched]);
    const upsertCandles = vi.fn();
    const repository = createRepository({
      findLatest: vi
        .fn()
        .mockResolvedValueOnce([stale])
        .mockResolvedValueOnce(persisted),
      upsertCandles,
    });
    const service = createService(
      { getSymbols: () => ['BTCUSDT'], getCandles },
      repository,
    );

    const result = await service.getCandles('BTCUSDT', '1h');

    expect(getCandles).toHaveBeenCalledWith('BTCUSDT', {
      interval: '1h',
      limit: 100,
    });
    expect(upsertCandles).toHaveBeenCalledWith([
      {
        symbol: 'BTCUSDT',
        interval: '1h',
        timestamp: fetched.timestamp,
        open: fetched.open,
        high: fetched.high,
        low: fetched.low,
        close: fetched.close,
        volume: fetched.volume,
      },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      symbol: 'BTCUSDT',
      timestamp: persisted[0].timestamp,
    });
  });

  it('propagates provider candles when the store is empty and cannot be re-read', async () => {
    const fetched = candle();
    const getCandles = vi.fn().mockResolvedValue([fetched]);
    const upsertCandles = vi.fn();
    const repository = createRepository({
      findLatest: vi.fn().mockResolvedValue([]),
      upsertCandles,
    });
    const service = createService(
      { getSymbols: () => ['BTCUSDT'], getCandles },
      repository,
    );

    const result = await service.getCandles('BTCUSDT', '1h');

    expect(upsertCandles).toHaveBeenCalledTimes(1);
    expect(result).toEqual([fetched]);
  });

  it('fetches a ticker for a valid symbol', async () => {
    const getTicker = vi.fn().mockResolvedValue(null);
    const service = createService({ getSymbols: () => ['BTCUSDT'], getTicker });

    await service.getTicker('BTCUSDT');
    expect(getTicker).toHaveBeenCalledWith('BTCUSDT');
  });
});
