import { describe, expect, it, vi } from 'vitest';
import type { BrokerAdapter, BrokerOrder } from '@trading-bolt/broker-adapters';
import { OrderReconciliationService } from './reconciliation.service.js';
import { PaperOrderEntity } from '../paper-trading/entities/paper-trading.entity.js';

function makeOrder(
  overrides: Partial<PaperOrderEntity> = {},
): PaperOrderEntity {
  const order = new PaperOrderEntity();
  order.id = 'order-1';
  order.accountId = 'account-1';
  order.clientOrderId = 'client-1';
  order.brokerOrderId = 'bybit-1';
  order.provider = 'bybit';
  order.side = 'buy';
  order.type = 'market';
  order.symbol = 'BTCUSDT';
  order.quantity = '10';
  order.price = null;
  order.stopLoss = null;
  order.takeProfit = null;
  order.reduceOnly = false;
  order.feeRate = '0.001';
  order.slippageRate = '0';
  order.status = 'SUBMITTED';
  order.filledQuantity = '0';
  order.avgFillPrice = null;
  order.fees = '0';
  order.reason = null;
  order.createdAt = new Date('2026-01-01T00:00:00Z');
  order.updatedAt = new Date('2026-01-01T00:00:00Z');
  return Object.assign(order, overrides);
}

function remoteOrder(overrides: Partial<BrokerOrder> = {}): BrokerOrder {
  return {
    id: 'bybit-1',
    clientOrderId: 'client-1',
    side: 'buy',
    type: 'market',
    symbol: 'BTCUSDT',
    quantity: '10',
    status: 'SUBMITTED',
    avgFillPrice: null,
    filledQuantity: '0',
    fees: '0',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

function makeService(options: {
  pending: PaperOrderEntity[];
  adapter: BrokerAdapter | null;
}) {
  const saved: PaperOrderEntity[] = [];
  const repo = {
    listPendingLive: vi.fn(async () => options.pending),
    save: vi.fn(async (order: PaperOrderEntity) => {
      saved.push(order);
      return order;
    }),
  };
  const brokers = {
    getLiveAdapter: vi.fn(() => options.adapter),
  };
  const service = new OrderReconciliationService(
    repo as never,
    brokers as never,
  );
  return { service, repo, brokers, saved };
}

describe('OrderReconciliationService', () => {
  it('does nothing when a live broker is not configured', async () => {
    const { service, repo } = makeService({
      pending: [],
      adapter: null,
    });
    const outcome = await service.reconcile();
    expect(outcome).toEqual({ checked: 0, updated: 0, mismatches: [] });
    expect(repo.listPendingLive).not.toHaveBeenCalled();
  });

  it('syncs a fill reported by the broker without fabricating data', async () => {
    const order = makeOrder();
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () =>
        remoteOrder({
          status: 'FILLED',
          avgFillPrice: '1.50',
          filledQuantity: '10',
          fees: '0.015',
        }),
      ),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.mismatches).toEqual([]);
    expect(outcome.updated).toBe(1);
    expect(saved[0].status).toBe('FILLED');
    expect(saved[0].brokerStatus).toBe('FILLED');
    expect(saved[0].filledQuantity).toBe('10');
    expect(saved[0].avgFillPrice).toBe('1.5');
    expect(saved[0].fees).toBe('0.015');
    expect(saved[0].lastSyncedAt).toBeInstanceOf(Date);
  });

  it('settles real fill fees on an already-terminal local order', async () => {
    // A market entry fills at creation with provisional fees "0"; the first
    // reconciliation sweep replaces them with the broker's cumulative figure
    // (BinanceAdapter derives it from /api/v3/myTrades).
    const order = makeOrder({ status: 'FILLED', filledQuantity: '10' });
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () =>
        remoteOrder({
          status: 'FILLED',
          avgFillPrice: '1.50',
          filledQuantity: '10',
          fees: '0.023',
        }),
      ),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.updated).toBe(1);
    expect(outcome.mismatches).toEqual([]);
    expect(saved[0].status).toBe('FILLED');
    expect(saved[0].fees).toBe('0.023');
  });

  it('keeps local fees when a terminal order still shows open at the broker', async () => {
    const order = makeOrder({
      status: 'FILLED',
      filledQuantity: '10',
      fees: '7.5',
    });
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () =>
        remoteOrder({ status: 'ACCEPTED', fees: '0' }),
      ),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.mismatches).toHaveLength(1);
    expect(saved[0].status).toBe('FILLED');
    // A broker "open" view of a filled local order must never erase real fees.
    expect(saved[0].fees).toBe('7.5');
  });

  it('marks brokerStatus on an unchanged pending order', async () => {
    const order = makeOrder();
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () => remoteOrder()),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.updated).toBe(0);
    expect(outcome.mismatches).toEqual([]);
    expect(saved[0].status).toBe('SUBMITTED');
    expect(saved[0].brokerStatus).toBe('SUBMITTED');
  });

  it('fails an order the broker no longer knows, never leaving it hanging', async () => {
    const order = makeOrder();
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () => null),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.updated).toBe(1);
    expect(outcome.mismatches).toEqual([]);
    expect(saved[0].status).toBe('FAILED');
    expect(saved[0].brokerStatus).toBe('NOT_FOUND');
    expect(saved[0].reason).toContain('Not found at broker');
  });

  it('keeps a terminal local order when the broker still shows it open', async () => {
    const order = makeOrder({ status: 'FILLED', filledQuantity: '10' });
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () =>
        remoteOrder({ status: 'ACCEPTED', filledQuantity: '0' }),
      ),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(saved[0].status).toBe('FILLED');
    expect(outcome.mismatches).toHaveLength(1);
    expect(outcome.mismatches[0].detail).toContain(
      'broker still reports ACCEPTED',
    );
  });

  it('flags a broker identity mismatch without overwriting local state', async () => {
    const order = makeOrder();
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () =>
        remoteOrder({ symbol: 'ETHUSDT', side: 'sell' }),
      ),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.mismatches).toHaveLength(1);
    expect(outcome.mismatches[0].detail).toContain('ETHUSDT/sell');
    expect(saved[0].status).toBe('SUBMITTED');
    expect(saved[0].symbol).toBe('BTCUSDT');
  });

  it('surfaces a broker lookup failure as a mismatch', async () => {
    const order = makeOrder();
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () => {
        throw new Error('connection refused');
      }),
    } as never;
    const { service, repo } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.updated).toBe(0);
    expect(outcome.mismatches).toHaveLength(1);
    expect(outcome.mismatches[0].detail).toContain('connection refused');
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('syncs a partial fill without changing the local status', async () => {
    const order = makeOrder({ status: 'PARTIALLY_FILLED' });
    const adapter: BrokerAdapter = {
      getOrder: vi.fn(async () =>
        remoteOrder({
          status: 'PARTIALLY_FILLED',
          avgFillPrice: '1.52',
          filledQuantity: '6',
          fees: '0.009',
        }),
      ),
    } as never;
    const { service, saved } = makeService({ pending: [order], adapter });

    const outcome = await service.reconcile();

    expect(outcome.updated).toBe(1);
    expect(outcome.mismatches).toEqual([]);
    expect(saved[0].status).toBe('PARTIALLY_FILLED');
    expect(saved[0].filledQuantity).toBe('6');
    expect(saved[0].avgFillPrice).toBe('1.52');
  });

  it('scopes the sweep to a single account when asked', async () => {
    const adapter: BrokerAdapter = { getOrder: vi.fn() } as never;
    const { service, repo } = makeService({ pending: [], adapter });
    await service.reconcile({ accountId: 'account-9' });
    expect(repo.listPendingLive).toHaveBeenCalledWith('account-9');
  });
});
