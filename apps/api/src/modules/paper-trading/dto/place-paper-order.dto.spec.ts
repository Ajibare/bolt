import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { PlacePaperOrderDto } from './place-paper-order.dto.js';

async function errors(input: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(PlacePaperOrderDto, input);
  const validation = await validate(dto);
  return validation.flatMap((entry) => Object.values(entry.constraints ?? {}));
}

const base = {
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'market',
  quantity: '1',
};

describe('PlacePaperOrderDto', () => {
  it('accepts a valid market order', async () => {
    expect(await errors(base)).toEqual([]);
  });

  it('rejects an unsafe symbol', async () => {
    expect(await errors({ ...base, symbol: 'DOGEUSDT' })).not.toEqual([]);
  });

  it('rejects an invalid side or type', async () => {
    expect(await errors({ ...base, side: 'hold' })).not.toEqual([]);
    expect(await errors({ ...base, type: 'stop' })).not.toEqual([]);
  });

  it('rejects a non-decimal quantity', async () => {
    expect(await errors({ ...base, quantity: '1abc' })).not.toEqual([]);
  });

  it('requires a price for limit orders', async () => {
    expect(await errors({ ...base, type: 'limit' })).not.toEqual([]);
  });

  it('accepts a limit order with a price', async () => {
    expect(await errors({ ...base, type: 'limit', price: '90' })).toEqual([]);
  });

  it('accepts optional risk fields and an idempotency key', async () => {
    expect(
      await errors({
        ...base,
        stopLoss: '95',
        takeProfit: '110',
        reduceOnly: true,
        clientOrderId: 'abc-123',
      }),
    ).toEqual([]);
  });
});
