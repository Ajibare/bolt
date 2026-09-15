import { describe, expect, it, vi } from 'vitest';
import type { BrokerAdapter } from '@trading-bolt/broker-adapters';
import { PositionReconciliationService } from './position-reconciliation.service.js';
import { PaperOrderEntity } from '../paper-trading/entities/paper-trading.entity.js';

function makeOrder(
  overrides: Partial<PaperOrderEntity> = {},
): PaperOrderEntity {
  const order = new PaperOrderEntity();
  order.id = 'order-1';
  order.accountId = 'account-1';
  order.clientOrderId = 'client-1';
  order.provider = 'bybit';
  order.side = 'buy';
  order.type = 'market';
  order.symbol = 'BTCUSDT';
  order.quantity = '10';
  order.status = 'FILLED';
  order.filledQuantity = '0';
  order.avgFillPrice = null;
  order.fees = '0';
  order.feeRate = '0.001';
  order.slippageRate = '0';
  order.reason = null;
  order.createdAt = new Date('2026-01-01T00:00:00Z');
  order.updatedAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(order, overrides);
}

function brokerPosition(quantity: string) {
  return { symbol: 'BTCUSDT', quantity, avgEntryPrice: '100', fees: '0' };
}

function makeService(options: {
  adapter: BrokerAdapter | null;
  accounts?: string[];
}) {
  const defaultOrders = [makeOrder({ status: 'FILLED', filledQuantity: '3' })];
  const orders = {
    listLiveAccounts: vi.fn(async () => options.accounts ?? ['account-1']),
    listByAccount: vi.fn(async (_accountId: string) => defaultOrders),
  };
  const brokers = {
    getBybitAdapter: vi.fn(() => options.adapter),
  };
  const service = new PositionReconciliationService(
    orders as never,
    brokers as never,
  );
  return { service, orders, brokers };
}

function adapterWith(...positions: Array<ReturnType<typeof brokerPosition>>) {
  return {
    getPositions: vi.fn(async () => positions),
  } as unknown as BrokerAdapter;
}

describe('PositionReconciliationService', () => {
  it('skips everything when a live broker is not configured', async () => {
    const { service, orders } = makeService({ adapter: null });
    const outcome = await service.reconcile();
    expect(outcome).toEqual({
      checkedAccounts: 0,
      comparedSymbols: 0,
      divergences: [],
    });
    expect(orders.listLiveAccounts).not.toHaveBeenCalled();
  });

  it('reports no divergence when the ledger matches the broker', async () => {
    const { service } = makeService({
      adapter: adapterWith(brokerPosition('3')),
    });

    const outcome = await service.reconcile();

    expect(outcome.checkedAccounts).toBe(1);
    expect(outcome.comparedSymbols).toBe(1);
    expect(outcome.divergences).toEqual([]);
  });

  it('derives the net from the signed fill identity (buy + buy - sell)', async () => {
    const { service, orders } = makeService({
      adapter: adapterWith(brokerPosition('4')),
    });
    orders.listByAccount.mockResolvedValue([
      makeOrder({ filledQuantity: '2' }),
      makeOrder({ symbol: 'BTCUSDT', filledQuantity: '3' }),
      makeOrder({ side: 'sell', symbol: 'BTCUSDT', filledQuantity: '1' }),
    ]);

    const outcome = await service.reconcile();

    expect(outcome.divergences).toEqual([]);
    expect(outcome.comparedSymbols).toBe(1);
  });

  it('flags a pre-existing broker position the ledger never touched', async () => {
    const { service, orders } = makeService({
      adapter: adapterWith(brokerPosition('10')),
    });
    orders.listByAccount.mockResolvedValue([
      makeOrder({ status: 'CANCELLED', filledQuantity: '0' }),
    ]);

    const outcome = await service.reconcile();

    expect(outcome.divergences).toHaveLength(1);
    expect(outcome.divergences[0]).toMatchObject({
      accountId: 'account-1',
      symbol: 'BTCUSDT',
      expected: '0',
      broker: '10',
    });
  });

  it('flags a symbol the broker no longer holds', async () => {
    const { service } = makeService({ adapter: adapterWith() });

    const outcome = await service.reconcile();

    expect(outcome.divergences).toHaveLength(1);
    expect(outcome.divergences[0]).toMatchObject({
      symbol: 'BTCUSDT',
      expected: '3',
      broker: '0',
    });
  });

  it('treats a reduce-only close as a reduction of the net position', async () => {
    const { service, orders } = makeService({ adapter: adapterWith() });
    orders.listByAccount.mockResolvedValue([
      makeOrder({ filledQuantity: '5' }),
      makeOrder({
        side: 'sell',
        reduceOnly: true,
        symbol: 'BTCUSDT',
        filledQuantity: '5',
      }),
    ]);

    const outcome = await service.reconcile();

    expect(outcome.divergences).toEqual([]);
    expect(outcome.comparedSymbols).toBe(1);
  });

  it('ignores paper-provider orders when computing the net', async () => {
    const { service, orders } = makeService({ adapter: adapterWith() });
    orders.listByAccount.mockResolvedValue([
      makeOrder({ provider: 'paper', filledQuantity: '100' }),
    ]);

    const outcome = await service.reconcile();

    expect(outcome.comparedSymbols).toBe(0);
    expect(outcome.divergences).toEqual([]);
  });

  it('scopes the pass to a single account when asked', async () => {
    const { service, orders } = makeService({ adapter: adapterWith() });

    await service.reconcile({ accountId: 'account-9' });

    expect(orders.listLiveAccounts).not.toHaveBeenCalled();
    expect(orders.listByAccount).toHaveBeenCalledWith('account-9');
  });

  it('skips an account whose broker positions are unreachable', async () => {
    const adapter = {
      getPositions: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    } as unknown as BrokerAdapter;
    const { service } = makeService({ adapter });

    const outcome = await service.reconcile();

    expect(outcome.checkedAccounts).toBe(0);
    expect(outcome.divergences).toEqual([]);
  });

  it('reconciles one account while another has no live-provider rows', async () => {
    const { service, orders } = makeService({
      adapter: adapterWith(brokerPosition('3')),
      accounts: ['account-a', 'account-b'],
    });
    orders.listByAccount.mockImplementation(async (accountId: string) => {
      if (accountId === 'account-a') {
        return [makeOrder({ status: 'FILLED', filledQuantity: '3' })];
      }
      return [];
    });

    const outcome = await service.reconcile();

    expect(outcome.checkedAccounts).toBe(1);
    expect(outcome.divergences).toEqual([]);
  });
});
