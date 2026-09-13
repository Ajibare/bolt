import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { EvaluateStrategyDto } from './evaluate-strategy.dto.js';

async function errors(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(EvaluateStrategyDto, input);
  const validation = await validate(dto);
  return validation.flatMap((entry) => Object.values(entry.constraints ?? {}));
}

const valid = {
  strategyId: 'sma-crossover',
  symbol: 'BTCUSDT',
  interval: '1h',
  config: { fastPeriod: 2, slowPeriod: 3 },
};

describe('EvaluateStrategyDto', () => {
  it('accepts a valid payload', async () => {
    expect(await errors(valid)).toEqual([]);
  });

  it('accepts an optional limit within range', async () => {
    expect(await errors({ ...valid, limit: 50 })).toEqual([]);
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
});
