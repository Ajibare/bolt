import { BadRequestException } from '@nestjs/common';
import type { BrokerOrder } from '@trading-bolt/broker-adapters';
import type { RiskAccountState } from '@trading-bolt/risk-engine';
import { describe, expect, it, vi } from 'vitest';
import { PaperOrderEntity } from '../paper-trading/entities/paper-trading.entity.js';
import { CircuitBreakerOpenError } from './circuit-breaker.service.js';
import { LiveTradingService } from './live-trading.service.js';

const SYMBOL = 'BTCUSDT';

const HEALTHY_FACTS: RiskAccountState = {
  equity: '10000',
  realizedPnlToday: '0',
  currentDrawdown: '0',
  openPositions: 0,
  currentExposure: '0',
  heldPosition: undefined,
};

function adapter() {
  return {
    placeOrder: vi.fn(
      async (request: {
        side: string;
        type: string;
        symbol: string;
        quantity: string;
        clientOrderId: string;
      }): Promise<BrokerOrder> => ({
        id: 'broker-1',
        clientOrderId: request.clientOrderId,
        side: request.side as BrokerOrder['side'],
        type: request.type as BrokerOrder['type'],
        symbol: request.symbol,
        quantity: request.quantity,
        reduceOnly: false,
        status: 'SUBMITTED',
        filledQuantity: '0',
        avgFillPrice: null,
        fees: '0',
        createdAt: 0,
        updatedAt: 0,
      }),
    ),
    getAccountState: vi.fn(async () => ({
      balances: [{ asset: 'USDT', free: '10000', used: '0', total: '10000' }],
    })),
    getPositions: vi.fn(async () => []),
    getOpenOrders: vi.fn(async () => []),
    cancelOrder: vi.fn(async () => undefined),
  };
}

function createService(overrides: {
  adapter?: ReturnType<typeof adapter> | null;
  provider?: 'binance' | 'bybit';
  facts?: RiskAccountState;
  existing?: PaperOrderEntity | null;
  assertAllowed?: () => void;
  openBreakers?: string[];
  openEntries?: Array<{
    severity: string;
    reason: string;
    trippedAtMs: number;
  }>;
  owner?: boolean;
}) {
  const broker =
    overrides.adapter === undefined ? adapter() : overrides.adapter;
  const orders = {
    findById: vi.fn(),
    findByAccountAndClientOrderId: vi.fn(
      async () => overrides.existing ?? null,
    ),
    findLiveByBrokerOrderIds: vi.fn(
      async (_ids: string[]) => [] as PaperOrderEntity[],
    ),
    save: vi.fn(async (entity: PaperOrderEntity) => entity),
  };
  const accounts = {
    findByUserIdAndId: vi.fn(async () =>
      overrides.owner === false ? null : { id: 'acc-1' },
    ),
  };
  const brokers = {
    getLiveAdapter: vi.fn(() => broker),
    provider: vi.fn(() => overrides.provider ?? 'bybit'),
    environment: vi.fn(() => 'demo'),
  };
  const markets = {
    getTicker: vi.fn(async () => ({
      symbol: SYMBOL,
      timestamp: 1,
      lastPrice: '100',
      high: '100',
      low: '100',
      volume: '0',
    })),
  };
  const circuitBreaker = {
    observeAccount: vi.fn(() => overrides.facts ?? HEALTHY_FACTS),
    assertTradingAllowed:
      overrides.assertAllowed ??
      vi.fn(async () => {
        /* CLOSED — allowed */
      }),
    openSeverities: vi.fn(() => overrides.openBreakers ?? []),
    open: vi.fn(() => overrides.openEntries ?? []),
  };
  const reconciliation = {
    enqueue: vi.fn(async () => undefined),
  };
  const service = new LiveTradingService(
    orders as never,
    accounts as never,
    brokers as never,
    markets as never,
    circuitBreaker as never,
    reconciliation as never,
  );
  return {
    service,
    adapter: broker as ReturnType<typeof adapter> | null,
    orders,
    accounts,
    brokers: brokers as never,
    circuitBreaker,
    reconciliation,
  };
}

const input = {
  accountId: 'acc-1',
  botId: 'bot-1',
  symbol: SYMBOL,
  side: 'buy' as const,
  type: 'market' as const,
  quantity: '1',
  price: '100',
  stopLoss: '95',
  takeProfit: '105',
  clientOrderId: 'bolt-1',
};

describe('LiveTradingService.placeOrder', () => {
  it('fails closed when the live broker is not configured', async () => {
    const { service } = createService({ adapter: null });
    await expect(service.placeOrder(input)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns the existing order on a duplicate clientOrderId (idempotency)', async () => {
    const existing = new PaperOrderEntity();
    existing.id = 'existing-1';
    const { service, adapter, orders } = createService({ existing });
    const result = await service.placeOrder(input);

    expect(orders.findByAccountAndClientOrderId).toHaveBeenCalledWith(
      'acc-1',
      'bolt-1',
    );
    expect(adapter).not.toBeNull();
    expect(adapter!.placeOrder).not.toHaveBeenCalled();
    expect(result.id).toBe('existing-1');
  });

  it('places an approved order and persists it before enqueueing reconciliation', async () => {
    const { service, adapter, orders, reconciliation } = createService({});

    const result = await service.placeOrder(input);

    expect(adapter!.placeOrder).toHaveBeenCalledTimes(1);
    expect(orders.save).toHaveBeenCalledTimes(1);
    const saved = orders.save.mock.calls[0][0] as PaperOrderEntity;
    expect(saved.provider).toBe('bybit');
    expect(saved.brokerOrderId).toBe('broker-1');
    expect(saved.status).toBe('SUBMITTED');
    expect(saved.brokerStatus).toBe('SUBMITTED');
    expect(saved.clientOrderId).toBe('bolt-1');
    expect(saved.symbol).toBe(SYMBOL);
    expect(saved.side).toBe('buy');
    expect(saved.fees).toBe('0');
    expect(reconciliation.enqueue).toHaveBeenCalledWith('acc-1');
    expect(result.provider).toBe('bybit');
  });

  it('persists the Binance provider when Binance is the active broker', async () => {
    const { service } = createService({ provider: 'binance' });

    const result = await service.placeOrder(input);

    expect(result.provider).toBe('binance');
  });

  it('rejects a risky order and never reaches the broker', async () => {
    const { service, adapter } = createService({
      facts: { ...HEALTHY_FACTS, openPositions: 10 },
    });

    await expect(service.placeOrder(input)).rejects.toThrow(
      /Order rejected by risk engine/,
    );
    expect(adapter!.placeOrder).not.toHaveBeenCalled();
  });

  it('propagates a CircuitBreakerOpenError and never reaches the broker', async () => {
    const { service, adapter } = createService({
      assertAllowed: () => {
        throw new CircuitBreakerOpenError(
          'Daily loss (0.6) exceeded maxDailyLoss (0.05)',
        );
      },
    });

    await expect(service.placeOrder(input)).rejects.toBeInstanceOf(
      CircuitBreakerOpenError,
    );
    expect(adapter!.placeOrder).not.toHaveBeenCalled();
  });

  it('skips the breach check for reduce-only orders so exits are never blocked', async () => {
    const { service, adapter, circuitBreaker } = createService({
      facts: {
        ...HEALTHY_FACTS,
        openPositions: 1,
        heldPosition: { quantity: '1', side: 'long' },
      },
      openBreakers: [`account:acc-1`],
    });

    const result = await service.placeOrder({
      ...input,
      side: 'sell',
      reduceOnly: true,
      quantity: '1',
    });

    expect(circuitBreaker.assertTradingAllowed).not.toHaveBeenCalled();
    expect(adapter!.placeOrder).toHaveBeenCalledTimes(1);
    expect(result.provider).toBe('bybit');
  });
});

describe('LiveTradingService.getHeldQuantity', () => {
  it('returns the signed broker-held quantity for a symbol', async () => {
    const broker = adapter();
    broker.getPositions.mockResolvedValue([
      { symbol: SYMBOL, quantity: '-2', avgEntryPrice: '100', fees: '0' },
    ] as never);
    const { service } = createService({ adapter: broker });

    await expect(service.getHeldQuantity('acc-1', SYMBOL)).resolves.toBe('-2');
  });

  it('fails closed when the live broker is not configured', async () => {
    const { service } = createService({ adapter: null });
    await expect(
      service.getHeldQuantity('acc-1', SYMBOL),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});

function liveOrder(partial: Partial<PaperOrderEntity> = {}): PaperOrderEntity {
  const order = new PaperOrderEntity();
  order.id = 'order-1';
  order.accountId = 'acc-1';
  order.clientOrderId = 'bolt-1';
  order.brokerOrderId = 'broker-1';
  order.provider = 'bybit';
  order.status = 'SUBMITTED';
  order.brokerStatus = 'SUBMITTED';
  order.side = 'buy';
  order.type = 'market';
  order.symbol = SYMBOL;
  order.quantity = '1';
  order.fees = '0';
  order.feeRate = '0.001';
  order.slippageRate = '0';
  return { ...order, ...partial };
}

describe('LiveTradingService.cancelOrder', () => {
  it('cancels at the broker and lets reconciliation confirm the final state', async () => {
    const { service, adapter, orders, accounts, reconciliation } =
      createService({});
    orders.findById.mockResolvedValue(liveOrder());
    accounts.findByUserIdAndId.mockResolvedValue({ id: 'acc-1' });

    const result = await service.cancelOrder('user-1', 'order-1');

    expect(adapter!.cancelOrder).toHaveBeenCalledWith('broker-1', {
      symbol: SYMBOL,
    });
    expect(result.status).toBe('SUBMITTED');
    expect(reconciliation.enqueue).toHaveBeenCalledWith('acc-1');
  });

  it('rejects an unknown order without leaking existence', async () => {
    const { service, orders } = createService({});
    orders.findById.mockResolvedValue(null);

    await expect(
      service.cancelOrder('user-1', 'order-1'),
    ).rejects.toMatchObject({ message: 'Order not found' });
  });

  it("rejects another user's order", async () => {
    const { service, orders, accounts } = createService({});
    orders.findById.mockResolvedValue(liveOrder());
    accounts.findByUserIdAndId.mockResolvedValue(null);

    await expect(
      service.cancelOrder('user-2', 'order-1'),
    ).rejects.toMatchObject({ message: 'Order not found' });
  });

  it('rejects cancellation of a non-live order', async () => {
    const { service, orders, accounts } = createService({});
    orders.findById.mockResolvedValue(
      liveOrder({ provider: 'paper', brokerOrderId: null }),
    );
    accounts.findByUserIdAndId.mockResolvedValue({ id: 'acc-1' });

    await expect(
      service.cancelOrder('user-1', 'order-1'),
    ).rejects.toMatchObject({ message: /live broker orders/ });
  });

  it('is idempotent when the order is already cancelled', async () => {
    const { service, adapter, orders } = createService({});
    orders.findById.mockResolvedValue(liveOrder({ status: 'CANCELLED' }));

    const result = await service.cancelOrder('user-1', 'order-1');

    expect(adapter!.cancelOrder).not.toHaveBeenCalled();
    expect(result.status).toBe('CANCELLED');
  });

  it('rejects cancellation of a filled order', async () => {
    const { service, orders } = createService({});
    orders.findById.mockResolvedValue(liveOrder({ status: 'FILLED' }));

    await expect(
      service.cancelOrder('user-1', 'order-1'),
    ).rejects.toMatchObject({ message: /Cannot cancel/ });
  });

  it('fails closed when the live broker is not configured', async () => {
    const { service, orders, accounts } = createService({ adapter: null });
    orders.findById.mockResolvedValue(liveOrder());
    accounts.findByUserIdAndId.mockResolvedValue({ id: 'acc-1' });

    await expect(
      service.cancelOrder('user-1', 'order-1'),
    ).rejects.toMatchObject({ message: /not configured/ });
  });
});

describe('LiveTradingService.emergencyFlatten', () => {
  it('cancels open orders and closes a long with a reduce-only market sell', async () => {
    const broker = adapter();
    broker.getOpenOrders.mockResolvedValue([
      { id: 'open-1', symbol: SYMBOL } as never,
    ]);
    broker.getPositions.mockResolvedValue([
      { symbol: SYMBOL, quantity: '2', avgEntryPrice: '100', fees: '0' },
    ] as never);
    const {
      service,
      adapter: brokerAdapter,
      orders,
      reconciliation,
    } = createService({
      adapter: broker,
      facts: {
        ...HEALTHY_FACTS,
        openPositions: 1,
        heldPosition: { quantity: '2', side: 'long' },
      },
    });
    orders.findByAccountAndClientOrderId.mockResolvedValue(null);

    await service.emergencyFlatten({
      accountId: 'acc-1',
      botId: 'bot-1',
      symbol: SYMBOL,
    });

    expect(brokerAdapter!.cancelOrder).toHaveBeenCalledWith('open-1', {
      symbol: SYMBOL,
    });
    expect(brokerAdapter!.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'sell',
        type: 'market',
        quantity: '2',
        reduceOnly: true,
        symbol: SYMBOL,
      }),
    );
    expect(reconciliation.enqueue).toHaveBeenCalledWith('acc-1');
  });

  it('places no close order when the position is already flat', async () => {
    const { service, adapter, reconciliation } = createService({});

    await service.emergencyFlatten({
      accountId: 'acc-1',
      botId: 'bot-1',
      symbol: SYMBOL,
    });

    expect(adapter!.placeOrder).not.toHaveBeenCalled();
    expect(reconciliation.enqueue).toHaveBeenCalledWith('acc-1');
  });

  it('still flattens when listing open orders fails (errors contained)', async () => {
    const broker = adapter();
    broker.getOpenOrders.mockRejectedValue(new Error('timeout'));
    broker.getPositions.mockResolvedValue([
      { symbol: SYMBOL, quantity: '-1', avgEntryPrice: '100', fees: '0' },
    ] as never);
    const {
      service,
      adapter: brokerAdapter,
      orders,
      reconciliation,
    } = createService({
      adapter: broker,
      facts: {
        ...HEALTHY_FACTS,
        openPositions: 1,
        heldPosition: { quantity: '1', side: 'short' },
      },
    });
    orders.findByAccountAndClientOrderId.mockResolvedValue(null);

    await service.emergencyFlatten({
      accountId: 'acc-1',
      botId: 'bot-1',
      symbol: SYMBOL,
    });

    expect(brokerAdapter!.placeOrder).toHaveBeenCalledWith(
      expect.objectContaining({ side: 'buy', reduceOnly: true }),
    );
    expect(reconciliation.enqueue).toHaveBeenCalledWith('acc-1');
  });
});

describe('LiveTradingService.getAccountView', () => {
  it('fails closed to a not-configured view when no broker is present', async () => {
    const { service } = createService({ adapter: null });

    const view = await service.getAccountView();

    expect(view).toMatchObject({
      configured: false,
      environment: 'demo',
      balances: null,
      equity: null,
      freeBalance: null,
      positions: null,
      openOrders: null,
    });
  });

  it('sums equity and free balance across broker balances', async () => {
    const broker = adapter();
    broker.getAccountState.mockResolvedValue({
      balances: [
        { asset: 'USDT', free: '8000', used: '2000', total: '10000' },
        { asset: 'BTC', free: '0', used: '0', total: '0' },
      ],
    } as never);
    broker.getPositions.mockResolvedValue([
      { symbol: SYMBOL, quantity: '1', avgEntryPrice: '100', fees: '0' },
    ] as never);
    const { service } = createService({ adapter: broker });

    const view = await service.getAccountView();

    expect(view.configured).toBe(true);
    expect(view.environment).toBe('demo');
    expect(view.equity).toBe('10000');
    expect(view.freeBalance).toBe('8000');
    expect(view.positions).toHaveLength(1);
    expect(view.openOrders).toEqual([]);
    expect(view.warnings).toEqual([]);
  });

  it('degrades a failed broker surface into a warning, not a crash', async () => {
    const broker = adapter();
    broker.getPositions.mockRejectedValue(new Error('timeout'));
    const { service } = createService({ adapter: broker });

    const view = await service.getAccountView();

    expect(view.positions).toBeNull();
    expect(view.warnings).toEqual([
      expect.stringContaining('Positions unavailable: timeout'),
    ]);
    expect(view.equity).toBe('10000');
    expect(view.openOrders).toEqual([]);
  });

  it('exposes currently open circuit breakers without secrets', async () => {
    const { service } = createService({
      openEntries: [
        {
          severity: 'account:acc-1',
          reason: 'Daily loss exceeded',
          trippedAtMs: 1,
        },
      ],
    });

    const view = await service.getAccountView();

    expect(view.circuitBreakers).toEqual([
      {
        severity: 'account:acc-1',
        reason: 'Daily loss exceeded',
        trippedAtMs: 1,
      },
    ]);
    expect(view.configured).toBe(true);
  });

  it('attaches the local order id to broker open orders when one exists', async () => {
    const broker = adapter();
    broker.getOpenOrders.mockResolvedValue([
      { id: 'broker-9', symbol: SYMBOL, side: 'buy', type: 'market' } as never,
      { id: 'broker-10', symbol: SYMBOL, side: 'sell', type: 'limit' } as never,
    ]);
    const { service, orders } = createService({ adapter: broker });
    orders.findLiveByBrokerOrderIds.mockResolvedValue([
      liveOrder({ id: 'local-9', brokerOrderId: 'broker-9' }),
    ]);

    const view = await service.getAccountView();

    expect(orders.findLiveByBrokerOrderIds).toHaveBeenCalledWith([
      'broker-9',
      'broker-10',
    ]);
    expect(view.openOrders).toHaveLength(2);
    expect(view.openOrders![0].localId).toBe('local-9');
    expect(view.openOrders![1].localId).toBeNull();
  });
});
