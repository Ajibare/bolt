import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Signal, Candle, Ticker } from '@trading-bolt/shared';
import type { BotExecutionMode, BotStatus } from '@trading-bolt/shared';
import { createStrategy } from '@trading-bolt/trading-engine';
import { describe, expect, it, vi } from 'vitest';
import { BotRunnerService } from './bot-runner.service.js';
import { CircuitBreakerOpenError } from '../live-trading/circuit-breaker.service.js';
import { intervalToMs } from './bot-timing.js';
import {
  BotEntity,
  BotRunCycleEntity,
  BotRunEntity,
} from './entities/bot.entity.js';

vi.mock('@trading-bolt/trading-engine', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@trading-bolt/trading-engine')>();
  return {
    ...actual,
    createStrategy: vi.fn(),
  };
});

const SYMBOL = 'BTCUSDT';

function bot(overrides: Partial<BotEntity> = {}): BotEntity {
  return {
    id: 'bot-1',
    userId: 'user-1',
    name: 'Bolt 1',
    strategyId: 'sma-crossover',
    config: { kind: 'sma-crossover', fastPeriod: 5, slowPeriod: 20 },
    symbol: SYMBOL,
    interval: '1h',
    riskConfig: { maxRiskPerTrade: '0.01' },
    paperAccountId: 'acc-1',
    executionMode: 'PAPER' as BotExecutionMode,
    status: 'RUNNING' as BotStatus,
    quantity: '1',
    stopLossPercent: '0.02',
    takeProfitPercent: null,
    lastSignalDirection: null,
    lastSignalReason: null,
    lastSignalAt: null,
    lastOrderId: null,
    lastOrderStatus: null,
    lastOrderSymbol: null,
    lastError: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as BotEntity;
}

function run(overrides: Partial<BotRunEntity> = {}): BotRunEntity {
  return {
    id: 'run-1',
    botId: 'bot-1',
    status: 'RUNNING' as BotStatus,
    startedAt: new Date('2026-01-01T01:00:00Z'),
    stoppedAt: null,
    cyclesRun: 0,
    ordersPlaced: 0,
    ordersRejected: 0,
    lastCycleAt: null,
    error: null,
    createdAt: new Date('2026-01-01T01:00:00Z'),
    updatedAt: new Date('2026-01-01T01:00:00Z'),
    ...overrides,
  } as BotRunEntity;
}

function signal(direction: Signal['direction']): Signal {
  return {
    symbol: SYMBOL,
    strategyId: 'sma-crossover',
    direction,
    reason: 'test signal',
    timestamp: 1234567890000,
  };
}

function candles(closes: string[]): Candle[] {
  return closes.map((close, index) => ({
    symbol: SYMBOL,
    interval: '1h',
    timestamp: index * 3_600_000,
    open: close,
    high: close,
    low: close,
    close,
    volume: '1',
  }));
}

function ticker(lastPrice: string): Ticker {
  return {
    symbol: SYMBOL,
    timestamp: 1234567890000,
    lastPrice,
    high: lastPrice,
    low: lastPrice,
    volume: '0',
  };
}

function createRunner() {
  const bots = {
    findById: vi.fn(),
    save: vi.fn(async (entity: BotEntity) => entity),
  };
  const runs = {
    findById: vi.fn(),
    save: vi.fn(async (entity: BotRunEntity) => entity),
  };
  const markets = {
    getCandles: vi.fn(async () => candles(['100'])),
    getTicker: vi.fn(async () => ticker('100')),
  };
  const paper = {
    settleLimitOrders: vi.fn(async () => undefined),
    getPositions: vi.fn(async () => []),
    placeOrder: vi.fn(async () => ({
      id: 'order-1',
      status: 'FILLED',
      side: 'buy',
      symbol: SYMBOL,
    })),
  };
  const scheduler = {
    enqueue: vi.fn(async () => undefined),
  };
  const cycles = {
    save: vi.fn(async (entity: BotRunCycleEntity) => entity),
    listByRunId: vi.fn(),
  };
  const live = {
    placeOrder: vi.fn(async (_input: unknown) => ({
      id: 'order-live-1',
      status: 'SUBMITTED',
      side: 'buy',
      symbol: SYMBOL,
    })),
    getHeldQuantity: vi.fn(async (): Promise<string | null> => null),
  };
  const service = new BotRunnerService(
    bots as never,
    runs as never,
    markets as never,
    paper as never,
    scheduler as never,
    cycles as never,
    live as never,
  );
  vi.mocked(createStrategy).mockReturnValue({
    id: 'sma-crossover',
    evaluate: vi.fn(() => signal('hold')),
  });
  return { service, bots, runs, markets, paper, scheduler, cycles, live };
}

const job = (action: 'start' | 'cycle') => ({
  botId: 'bot-1',
  runId: 'run-1',
  action,
  scheduledAt: 1234567890000,
});

describe('BotRunnerService', () => {
  it('404s when the bot is missing', async () => {
    const { service, bots } = createRunner();
    bots.findById.mockResolvedValue(null as never);
    await expect(service.advance(job('cycle'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('404s when the run is missing', async () => {
    const { service, bots, runs } = createRunner();
    bots.findById.mockResolvedValue(bot());
    runs.findById.mockResolvedValue(null as never);
    await expect(service.advance(job('cycle'))).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('409s when the run belongs to a different bot', async () => {
    const { service, bots, runs } = createRunner();
    bots.findById.mockResolvedValue(bot());
    runs.findById.mockResolvedValue(run({ botId: 'bot-other' }));
    await expect(service.advance(job('cycle'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('start tick moves STARTING to RUNNING, runs a cycle, and re-enqueues next tick', async () => {
    const { service, bots, runs, paper, scheduler } = createRunner();
    const entity = bot({ status: 'STARTING' });
    const runEntity = run({ status: 'STARTING', startedAt: undefined });
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);

    const outcome = await service.advance(job('start'));

    expect(entity.status).toBe('RUNNING');
    expect(runEntity.status).toBe('RUNNING');
    expect(runEntity.startedAt).toBeInstanceOf(Date);
    expect(outcome.skipped).toBe(false);
    expect(paper.settleLimitOrders).toHaveBeenCalledWith('user-1', 'acc-1');
    expect(runEntity.cyclesRun).toBe(1);
    expect(bots.save).toHaveBeenCalledWith(entity);
    expect(runs.save).toHaveBeenCalledWith(runEntity);
    expect(scheduler.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        botId: 'bot-1',
        runId: 'run-1',
        action: 'cycle',
      }),
      { delayMs: intervalToMs('1h') },
    );
  });

  it('rejects a start tick when the bot is not in a startable state', async () => {
    const { service, bots, runs } = createRunner();
    bots.findById.mockResolvedValue(bot({ status: 'STOPPED' }));
    runs.findById.mockResolvedValue(run());
    await expect(service.advance(job('start'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('places a risk-gated buy passing the bot risk config and counts the order', async () => {
    const { service, bots, runs, paper } = createRunner();
    const entity = bot();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(run());
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('buy')),
    });

    await service.advance(job('cycle'));

    expect(paper.placeOrder).toHaveBeenCalledTimes(1);
    const [userId, accountId, dto, riskConfig] = paper.placeOrder.mock
      .calls[0] as unknown[];
    expect(userId).toBe('user-1');
    expect(accountId).toBe('acc-1');
    expect(dto).toMatchObject({
      symbol: SYMBOL,
      side: 'buy',
      type: 'market',
      quantity: '1',
      stopLoss: '98',
      reduceOnly: false,
      clientOrderId: 'run-1:1234567890000',
    });
    expect(riskConfig).toEqual(entity.riskConfig);
    expect(entity.lastSignalDirection).toBe('buy');
    expect(entity.lastOrderId).toBe('order-1');
    expect(entity.lastOrderStatus).toBe('FILLED');
    expect(entity.lastOrderSymbol).toBe(SYMBOL);
  });

  it('closes the full held long as a reduce-only sell on a sell signal', async () => {
    const { service, bots, runs, paper } = createRunner();
    bots.findById.mockResolvedValue(bot());
    runs.findById.mockResolvedValue(run());
    paper.getPositions.mockResolvedValue([
      { symbol: SYMBOL, quantity: '2' },
    ] as never);
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('sell')),
    });

    await service.advance(job('cycle'));

    expect(paper.placeOrder).toHaveBeenCalledTimes(1);
    const [, , dto] = paper.placeOrder.mock.calls[0] as unknown[];
    expect(dto).toMatchObject({
      side: 'sell',
      quantity: '2',
      reduceOnly: true,
    });
  });

  it('places no order on a hold signal', async () => {
    const { service, bots, runs, paper } = createRunner();
    bots.findById.mockResolvedValue(bot());
    runs.findById.mockResolvedValue(run());

    await service.advance(job('cycle'));

    expect(paper.placeOrder).not.toHaveBeenCalled();
  });

  it('counts a risk rejection but keeps the bot RUNNING and re-enqueues', async () => {
    const { service, bots, runs, paper, scheduler } = createRunner();
    const entity = bot();
    const runEntity = run();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);
    paper.placeOrder.mockRejectedValue(
      new BadRequestException(
        'Order rejected by risk engine: max-position-size',
      ),
    );
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('buy')),
    });

    await service.advance(job('cycle'));

    expect(runEntity.ordersRejected).toBe(1);
    expect(runEntity.ordersPlaced).toBe(0);
    expect(entity.status).toBe('RUNNING');
    expect(entity.lastError).toBeNull();
    expect(scheduler.enqueue).toHaveBeenCalled();
  });

  it('flips the bot to ERROR on an unexpected failure and does not re-enqueue', async () => {
    const { service, bots, runs, markets, scheduler } = createRunner();
    const entity = bot();
    const runEntity = run();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);
    markets.getCandles.mockRejectedValue(new Error('market data unavailable'));

    const outcome = await service.advance(job('cycle'));

    expect(outcome.error).toBe('market data unavailable');
    expect(entity.status).toBe('ERROR');
    expect(runEntity.status).toBe('ERROR');
    expect(runEntity.error).toBe('market data unavailable');
    expect(entity.lastError).toBe('market data unavailable');
    expect(scheduler.enqueue).not.toHaveBeenCalled();
  });

  it('skips the cycle when the bot is not RUNNING', async () => {
    const { service, bots, runs, paper, scheduler } = createRunner();
    const entity = bot({ status: 'PAUSED' });
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(run({ status: 'PAUSED' }));

    const outcome = await service.advance(job('cycle'));

    expect(outcome.skipped).toBe(true);
    expect(paper.settleLimitOrders).not.toHaveBeenCalled();
    expect(bots.save).not.toHaveBeenCalled();
    expect(scheduler.enqueue).not.toHaveBeenCalled();
  });

  it('persists a cycle record with the signal and filled order', async () => {
    const { service, bots, runs, cycles } = createRunner();
    const entity = bot();
    const runEntity = run();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('buy')),
    });

    await service.advance(job('cycle'));

    expect(cycles.save).toHaveBeenCalledTimes(1);
    const saved = cycles.save.mock.calls[0][0] as BotRunCycleEntity;
    expect(saved.runId).toBe('run-1');
    expect(saved.seq).toBe(1);
    expect(saved.signalDirection).toBe('buy');
    expect(saved.signalReason).toBe('test signal');
    expect(saved.orderId).toBe('order-1');
    expect(saved.orderStatus).toBe('FILLED');
    expect(saved.orderSide).toBe('buy');
    expect(saved.orderSymbol).toBe(SYMBOL);
    expect(saved.rejectionReason).toBeNull();
    expect(saved.error).toBeNull();
  });

  it('persists the rejection reason when the risk engine rejects an order', async () => {
    const { service, bots, runs, paper, cycles } = createRunner();
    const entity = bot();
    const runEntity = run();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);
    paper.placeOrder.mockRejectedValue(
      new BadRequestException(
        'Order rejected by risk engine: max-position-size',
      ),
    );
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('buy')),
    });

    await service.advance(job('cycle'));

    expect(runEntity.ordersRejected).toBe(1);
    const saved = cycles.save.mock.calls[0][0] as BotRunCycleEntity;
    expect(saved.rejectionReason).toContain('rejected by risk engine');
    expect(saved.orderId).toBeNull();
    expect(saved.error).toBeNull();
  });

  it('persists the error detail on a failed cycle', async () => {
    const { service, bots, runs, markets, cycles } = createRunner();
    const entity = bot();
    const runEntity = run();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);
    markets.getCandles.mockRejectedValue(new Error('market data unavailable'));

    const outcome = await service.advance(job('cycle'));

    expect(outcome.error).toBe('market data unavailable');
    expect(entity.status).toBe('ERROR');
    const saved = cycles.save.mock.calls[0][0] as BotRunCycleEntity;
    expect(saved.seq).toBe(1);
    expect(saved.signalDirection).toBeNull();
    expect(saved.error).toBe('market data unavailable');
  });

  it('numbers consecutive cycles sequentially in one cycle record', async () => {
    const { service, bots, runs, cycles } = createRunner();
    const entity = bot();
    const runEntity = run();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);

    await service.advance(job('cycle'));
    await service.advance(job('cycle'));

    expect(cycles.save).toHaveBeenCalledTimes(2);
    const first = cycles.save.mock.calls[0][0] as BotRunCycleEntity;
    const second = cycles.save.mock.calls[1][0] as BotRunCycleEntity;
    expect(first.seq).toBe(1);
    expect(second.seq).toBe(2);
  });

  it('routes a LIVE bot through the live trading service and uses broker-held quantity', async () => {
    const { service, bots, runs, paper, live } = createRunner();
    const entity = bot({ executionMode: 'LIVE' });
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(run());
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('buy')),
    });

    await service.advance(job('cycle'));

    expect(live.getHeldQuantity).toHaveBeenCalledWith('acc-1', SYMBOL);
    expect(live.placeOrder).toHaveBeenCalledTimes(1);
    expect(paper.placeOrder).not.toHaveBeenCalled();
    const args = live.placeOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toMatchObject({
      accountId: 'acc-1',
      botId: 'bot-1',
      symbol: SYMBOL,
      side: 'buy',
      type: 'market',
      quantity: '1',
      stopLoss: '98',
      reduceOnly: false,
    });
    expect(args.clientOrderId).toMatch(/^bolt-[a-z0-9-]+-\d+$/);
    expect(entity.lastOrderId).toBe('order-live-1');
  });

  it('closes a broker-held long for a LIVE bot via a reduce-only live order', async () => {
    const { service, bots, runs, live } = createRunner();
    bots.findById.mockResolvedValue(bot({ executionMode: 'LIVE' }));
    runs.findById.mockResolvedValue(run());
    live.getHeldQuantity.mockResolvedValue('2');
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('sell')),
    });

    await service.advance(job('cycle'));

    expect(live.placeOrder).toHaveBeenCalledTimes(1);
    const args = live.placeOrder.mock.calls[0][0] as Record<string, unknown>;
    expect(args).toMatchObject({
      side: 'sell',
      quantity: '2',
      reduceOnly: true,
    });
  });

  it('flips a LIVE bot to ERROR when the circuit breaker is OPEN', async () => {
    const { service, bots, runs, live, scheduler } = createRunner();
    const entity = bot({ executionMode: 'LIVE' });
    const runEntity = run();
    bots.findById.mockResolvedValue(entity);
    runs.findById.mockResolvedValue(runEntity);
    live.placeOrder.mockRejectedValue(
      new CircuitBreakerOpenError(
        'Daily loss (0.9) exceeded maxDailyLoss (0.05)',
      ),
    );
    vi.mocked(createStrategy).mockReturnValue({
      id: 'sma-crossover',
      evaluate: vi.fn(() => signal('buy')),
    });

    const outcome = await service.advance(job('cycle'));

    expect(outcome.error).toContain('CIRCUIT_BREAKER');
    expect(entity.status).toBe('ERROR');
    expect(runEntity.status).toBe('ERROR');
    expect(runEntity.ordersRejected).toBe(0);
    expect(scheduler.enqueue).not.toHaveBeenCalled();
  });
});
