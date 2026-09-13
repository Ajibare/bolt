import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { RunBacktestDto } from './run-backtest.dto.js';

async function errors(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(RunBacktestDto, input);
  const validation = await validate(dto);
  return validation.flatMap((entry) => Object.values(entry.constraints ?? {}));
}

const valid = {
  strategyId: 'sma-crossover',
  symbol: 'BTCUSDT',
  interval: '1h',
  config: { fastPeriod: 2, slowPeriod: 3 },
};

describe('RunBacktestDto', () => {
  it('accepts a valid payload', async () => {
    expect(await errors(valid)).toEqual([]);
  });

  it('applies documented defaults', async () => {
    const dto = plainToInstance(RunBacktestDto, valid);
    expect(dto.startingBalance).toBe('10000');
    expect(dto.feeRate).toBe('0');
    expect(dto.slippageRate).toBe('0');
    expect(dto.positionSize).toBe('1');
    expect(dto.allowShort).toBe(false);
    expect(dto.riskFreeRate).toBe('0');
  });

  it('accepts custom optional values', async () => {
    expect(
      await errors({
        ...valid,
        limit: 50,
        startingBalance: '5000',
        feeRate: '0.001',
        slippageRate: '0.0005',
        positionSize: '0.5',
        allowShort: true,
        riskFreeRate: '0.0001',
      }),
    ).toEqual([]);
  });

  it('rejects an unsupported symbol', async () => {
    expect(await errors({ ...valid, symbol: 'DOGEUSDT' })).not.toEqual([]);
  });

  it('rejects an unsupported interval', async () => {
    expect(await errors({ ...valid, interval: '7d' })).not.toEqual([]);
  });

  it('rejects a non-object config', async () => {
    expect(await errors({ ...valid, config: 'oops' })).not.toEqual([]);
  });

  it('rejects an empty strategyId', async () => {
    expect(await errors({ ...valid, strategyId: '' })).not.toEqual([]);
  });

  it('rejects out-of-range limits', async () => {
    expect(await errors({ ...valid, limit: 0 })).not.toEqual([]);
    expect(await errors({ ...valid, limit: 201 })).not.toEqual([]);
    expect(await errors({ ...valid, limit: 1.5 })).not.toEqual([]);
  });

  it('rejects non-decimal financial strings', async () => {
    expect(await errors({ ...valid, startingBalance: 'abc' })).not.toEqual([]);
    expect(await errors({ ...valid, feeRate: '0,001' })).not.toEqual([]);
    expect(await errors({ ...valid, positionSize: '' })).not.toEqual([]);
  });

  it('rejects a non-boolean allowShort', async () => {
    expect(await errors({ ...valid, allowShort: 'yes' })).not.toEqual([]);
  });
});
