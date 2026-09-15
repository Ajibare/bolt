import { describe, expect, it } from 'vitest';
import { buildCycleIntent } from './bot-cycle.js';

const params = {
  quantity: '1.5',
  stopLossPercent: '0.02',
  takeProfitPercent: '0.04',
};

describe('buildCycleIntent', () => {
  it('returns null for a hold signal', () => {
    expect(buildCycleIntent(params, 'hold', '100', '0')).toBeNull();
    expect(buildCycleIntent(params, 'hold', '100', null)).toBeNull();
  });

  it('builds a buy entry with stop and take-profit around the market price', () => {
    const intent = buildCycleIntent(params, 'buy', '100', '0');
    expect(intent).toEqual({
      side: 'buy',
      quantity: '1.5',
      reduceOnly: false,
      stopLoss: '98',
      takeProfit: '104',
    });
  });

  it('omits take-profit when the policy disables it', () => {
    const intent = buildCycleIntent(
      { quantity: '1', stopLossPercent: '0.01', takeProfitPercent: null },
      'buy',
      '200',
      null,
    );
    expect(intent?.takeProfit).toBeUndefined();
    expect(intent?.stopLoss).toBe('198');
  });

  it('omits take-profit when the policy is undefined', () => {
    const intent = buildCycleIntent(
      { quantity: '1', stopLossPercent: '0.01', takeProfitPercent: undefined },
      'buy',
      '200',
      null,
    );
    expect(intent?.takeProfit).toBeUndefined();
    expect(intent?.stopLoss).toBe('198');
  });

  it('builds a reduce-only close of the full held quantity', () => {
    const intent = buildCycleIntent(params, 'sell', '150', '3');
    expect(intent).toEqual({
      side: 'sell',
      quantity: '3',
      reduceOnly: true,
    });
    expect(intent?.stopLoss).toBeUndefined();
    expect(intent?.takeProfit).toBeUndefined();
  });

  it('returns null for a sell signal with no held quantity', () => {
    expect(buildCycleIntent(params, 'sell', '150', null)).toBeNull();
    expect(buildCycleIntent(params, 'sell', '150', '0')).toBeNull();
  });

  it('keeps decimal precision for large prices', () => {
    const intent = buildCycleIntent(
      { quantity: '1', stopLossPercent: '0.001', takeProfitPercent: null },
      'buy',
      '123456.789',
      null,
    );
    expect(intent?.stopLoss).toBe('123333.332211');
  });
});
