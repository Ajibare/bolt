import { describe, expect, it } from 'vitest';

import {
  reconstructTrades,
  summarizeTrades,
  type FilledOrderLike,
} from './trade-metrics.js';

function order(overrides: Partial<FilledOrderLike> = {}): FilledOrderLike {
  return {
    symbol: 'BTCUSDT',
    side: 'buy',
    filledQuantity: '1',
    avgFillPrice: '100',
    fees: '0',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

const T = (day: number): Date => new Date(`2026-01-0${day}T00:00:00Z`);

describe('reconstructTrades', () => {
  it('closes a long round trip on a sell', () => {
    const trades = reconstructTrades([
      order({ side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({ side: 'sell', avgFillPrice: '110', createdAt: T(2) }),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0]).toMatchObject({
      symbol: 'BTCUSDT',
      direction: 'long',
      quantity: '1.00000000',
      entryPrice: '100',
      exitPrice: '110',
      grossPnl: '10.00000000',
      fees: '0.00000000',
      netPnl: '10.00000000',
      won: true,
    });
  });

  it('deducts entry and exit fees from the round trip', () => {
    const trades = reconstructTrades([
      order({ side: 'buy', avgFillPrice: '100', fees: '2', createdAt: T(1) }),
      order({ side: 'sell', avgFillPrice: '101', fees: '1', createdAt: T(2) }),
    ]);

    expect(trades[0].grossPnl).toBe('1.00000000');
    expect(trades[0].fees).toBe('3.00000000');
    expect(trades[0].netPnl).toBe('-2.00000000');
    expect(trades[0].won).toBe(false);
  });

  it('closes a short round trip on a buy', () => {
    const trades = reconstructTrades([
      order({ side: 'sell', avgFillPrice: '110', createdAt: T(1) }),
      order({ side: 'buy', avgFillPrice: '100', createdAt: T(2) }),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].direction).toBe('short');
    expect(trades[0].grossPnl).toBe('10.00000000');
    expect(trades[0].won).toBe(true);
  });

  it('matches multiple open lots FIFO', () => {
    const trades = reconstructTrades([
      order({ side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({ side: 'buy', avgFillPrice: '120', createdAt: T(2) }),
      order({
        side: 'sell',
        filledQuantity: '2',
        avgFillPrice: '130',
        createdAt: T(3),
      }),
    ]);

    expect(trades).toHaveLength(2);
    expect(trades[0].entryPrice).toBe('100');
    expect(trades[0].netPnl).toBe('30.00000000');
    expect(trades[1].entryPrice).toBe('120');
    expect(trades[1].netPnl).toBe('10.00000000');
  });

  it('leaves the unmatched remainder of a partially closing order open', () => {
    const trades = reconstructTrades([
      order({
        side: 'buy',
        filledQuantity: '2',
        avgFillPrice: '100',
        createdAt: T(1),
      }),
      order({
        side: 'sell',
        filledQuantity: '1',
        avgFillPrice: '110',
        createdAt: T(2),
      }),
    ]);

    expect(trades).toHaveLength(1);
    expect(trades[0].quantity).toBe('1.00000000');
  });

  it('allocates fees pro-rata on a partial close', () => {
    const trades = reconstructTrades([
      order({
        side: 'buy',
        filledQuantity: '2',
        avgFillPrice: '100',
        fees: '4',
        createdAt: T(1),
      }),
      order({
        side: 'sell',
        filledQuantity: '1',
        avgFillPrice: '110',
        fees: '2',
        createdAt: T(2),
      }),
    ]);

    expect(trades[0].fees).toBe('4.00000000');
    expect(trades[0].netPnl).toBe('6.00000000');
  });

  it('flips direction when an order exceeds the open lots', () => {
    const trades = reconstructTrades([
      order({ side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({
        side: 'sell',
        filledQuantity: '2',
        avgFillPrice: '130',
        createdAt: T(2),
      }),
      order({ side: 'buy', avgFillPrice: '120', createdAt: T(3) }),
    ]);

    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({
      direction: 'long',
      entryPrice: '100',
      exitPrice: '130',
    });
    expect(trades[1]).toMatchObject({
      direction: 'short',
      entryPrice: '130',
      exitPrice: '120',
    });
    expect(trades[1].netPnl).toBe('10.00000000');
  });

  it('keeps symbols independent', () => {
    const trades = reconstructTrades([
      order({
        symbol: 'BTCUSDT',
        side: 'buy',
        avgFillPrice: '100',
        createdAt: T(1),
      }),
      order({
        symbol: 'ETHUSDT',
        side: 'buy',
        avgFillPrice: '50',
        createdAt: T(1),
      }),
      order({
        symbol: 'BTCUSDT',
        side: 'sell',
        avgFillPrice: '110',
        createdAt: T(2),
      }),
      order({
        symbol: 'ETHUSDT',
        side: 'sell',
        avgFillPrice: '40',
        createdAt: T(3),
      }),
    ]);

    const metrics = summarizeTrades(trades);
    expect(trades).toHaveLength(2);
    expect(metrics.tradeCount).toBe(2);
    expect(metrics.winCount).toBe(1);
    expect(metrics.lossCount).toBe(1);
    expect(metrics.netPnl).toBe('0.00000000');
  });

  it('ignores orders with no fill price or zero filled quantity', () => {
    const trades = reconstructTrades([
      order({ avgFillPrice: null }),
      order({ filledQuantity: '0' }),
    ]);

    expect(trades).toEqual([]);
  });
});

describe('summarizeTrades', () => {
  it('reports zeros and a null profit factor with no trades', () => {
    const metrics = summarizeTrades([]);

    expect(metrics).toMatchObject({
      tradeCount: 0,
      winCount: 0,
      lossCount: 0,
      breakEvenCount: 0,
      winRate: '0.00000000',
      netPnl: '0.00000000',
      grossProfit: '0.00000000',
      grossLoss: '0.00000000',
      averageWin: '0.00000000',
      averageLoss: '0.00000000',
      profitFactor: null,
      totalFees: '0.00000000',
    });
  });

  it('computes win rate, averages and profit factor across wins and losses', () => {
    const trades = reconstructTrades([
      order({ symbol: 'A', side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({ symbol: 'B', side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({
        symbol: 'A',
        side: 'sell',
        avgFillPrice: '130',
        createdAt: T(2),
      }),
      order({ symbol: 'B', side: 'sell', avgFillPrice: '80', createdAt: T(3) }),
    ]);

    const metrics = summarizeTrades(trades);

    expect(metrics.tradeCount).toBe(2);
    expect(metrics.winCount).toBe(1);
    expect(metrics.lossCount).toBe(1);
    expect(metrics.winRate).toBe('0.50000000');
    expect(metrics.grossProfit).toBe('30.00000000');
    expect(metrics.grossLoss).toBe('20.00000000');
    expect(metrics.netPnl).toBe('10.00000000');
    expect(metrics.averageWin).toBe('30.00000000');
    expect(metrics.averageLoss).toBe('20.00000000');
    expect(metrics.profitFactor).toBe('1.50000000');
  });

  it('returns a null profit factor when there are no losing trades', () => {
    const trades = reconstructTrades([
      order({ side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({ side: 'sell', avgFillPrice: '120', createdAt: T(2) }),
    ]);

    expect(summarizeTrades(trades).profitFactor).toBeNull();
  });

  it('counts break-even trades in the denominator but not as wins or losses', () => {
    const trades = reconstructTrades([
      order({ symbol: 'A', side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({ symbol: 'B', side: 'buy', avgFillPrice: '100', createdAt: T(1) }),
      order({
        symbol: 'A',
        side: 'sell',
        avgFillPrice: '100',
        createdAt: T(2),
      }),
      order({
        symbol: 'B',
        side: 'sell',
        avgFillPrice: '110',
        createdAt: T(3),
      }),
    ]);

    const metrics = summarizeTrades(trades);

    expect(metrics.tradeCount).toBe(2);
    expect(metrics.winCount).toBe(1);
    expect(metrics.breakEvenCount).toBe(1);
    expect(metrics.winRate).toBe('0.50000000');
  });
});
