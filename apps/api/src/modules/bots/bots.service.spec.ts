import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BrokersService } from '../brokers/brokers.service.js';
import { LiveTradingService } from '../live-trading/live-trading.service.js';
import { PaperTradingService } from '../paper-trading/paper-trading.service.js';
import { BotsService } from './bots.service.js';
import { BotScheduler } from './bot-scheduler.js';

function createService(overrides: {
  isLiveConfigured?: boolean;
  environment?: 'demo' | 'testnet' | 'mainnet';
}) {
  const bots = {
    save: vi.fn(async (entity: unknown) => entity),
    listByUserId: vi.fn(async () => []),
    findByUserIdAndId: vi.fn(),
  };
  const runs = {
    save: vi.fn(async (entity: unknown) => entity),
    findById: vi.fn(),
    findActiveByBotId: vi.fn(),
    listByBotId: vi.fn(async () => []),
  };
  const cycles = {
    save: vi.fn(async (entity: unknown) => entity),
    listByRunId: vi.fn(async () => []),
  };
  const paperTrading = {
    listAccounts: vi.fn(async () => [{ id: 'acc-1' }]),
  };
  const scheduler = {
    enqueue: vi.fn(async () => undefined),
  };
  const brokers = {
    isLiveConfigured: vi.fn(() => overrides.isLiveConfigured ?? false),
    environment: vi.fn(() => overrides.environment ?? 'demo'),
  };
  const liveTrading = {
    emergencyFlatten: vi.fn(async () => undefined),
  };
  const notifications = {
    notifyUser: vi.fn(
      async (_userId: string, _input: Record<string, unknown>) => undefined,
    ),
  };
  const service = new BotsService(
    bots as never,
    runs as never,
    cycles as never,
    paperTrading as unknown as PaperTradingService,
    scheduler as unknown as BotScheduler,
    brokers as unknown as BrokersService,
    liveTrading as unknown as LiveTradingService,
    notifications as never,
  );
  return {
    service,
    bots,
    runs,
    paperTrading,
    brokers,
    liveTrading,
    notifications,
  };
}

function bot(executionMode: string) {
  return {
    id: 'bot-1',
    userId: 'user-1',
    paperAccountId: 'acc-1',
    name: 'Bolt 1',
    symbol: 'BTCUSDT',
    status: 'RUNNING',
    executionMode,
    strategyId: 'sma-crossover',
    config: { fastPeriod: 5, slowPeriod: 20 },
    interval: '1h',
    quantity: '1',
    stopLossPercent: '0.02',
    takeProfitPercent: null,
    riskConfig: {},
    lastError: null,
  };
}

function dto(executionMode: string) {
  return {
    name: 'Bolt 1',
    strategyId: 'sma-crossover',
    config: { kind: 'sma-crossover', fastPeriod: 5, slowPeriod: 20 },
    symbol: 'BTCUSDT',
    interval: '1h',
    paperAccountId: 'acc-1',
    executionMode,
    quantity: '1',
    stopLossPercent: '0.02',
  };
}

describe('BotsService.create execution-mode gate', () => {
  it('creates a PAPER bot without any broker credentials', async () => {
    const { service, bots } = createService({});
    const bot = await service.create('user-1', dto('PAPER') as never);

    expect(bot.executionMode).toBe('PAPER');
    expect(bots.save).toHaveBeenCalled();
  });

  it('rejects DEMO when the live broker is not configured', async () => {
    const { service } = createService({ isLiveConfigured: false });
    await expect(
      service.create('user-1', dto('DEMO') as never),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects an execution mode incompatible with the configured environment', async () => {
    const { service } = createService({
      isLiveConfigured: true,
      environment: 'mainnet',
    });
    await expect(
      service.create('user-1', dto('TESTNET') as never),
    ).rejects.toThrow(/incompatible/);
  });

  it('accepts DEMO when credentials target the demo environment', async () => {
    const { service } = createService({
      isLiveConfigured: true,
      environment: 'demo',
    });
    const bot = await service.create('user-1', dto('DEMO') as never);

    expect(bot.executionMode).toBe('DEMO');
  });

  it('rejects BACKTEST as an unsupported bot execution mode', async () => {
    const { service } = createService({});
    await expect(
      service.create('user-1', dto('BACKTEST') as never),
    ).rejects.toThrow(/run a backtest/);
  });
});

describe('BotsService.emergencyStop', () => {
  it('stops a PAPER bot without touching the live broker', async () => {
    const { service, bots, runs, liveTrading } = createService({});
    const b = bot('PAPER');
    bots.findByUserIdAndId.mockResolvedValue(b);
    runs.findActiveByBotId.mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
    });

    const stopped = await service.emergencyStop('user-1', 'bot-1');

    expect(stopped.status).toBe('STOPPED');
    expect(liveTrading.emergencyFlatten).not.toHaveBeenCalled();
    expect(runs.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'STOPPED' }),
    );
  });

  it('flattens the position of a live bot before stopping it', async () => {
    const { service, bots, liveTrading } = createService({
      isLiveConfigured: true,
      environment: 'demo',
    });
    const b = { ...bot('DEMO'), status: 'STARTING' };
    bots.findByUserIdAndId.mockResolvedValue(b);

    const stopped = await service.emergencyStop('user-1', 'bot-1');

    expect(stopped.status).toBe('STOPPED');
    expect(liveTrading.emergencyFlatten).toHaveBeenCalledWith({
      accountId: 'acc-1',
      botId: 'bot-1',
      symbol: 'BTCUSDT',
    });
  });

  it('still stops the bot when flattening fails (failure contained)', async () => {
    const { service, bots, liveTrading } = createService({});
    const b = { ...bot('DEMO'), status: 'RUNNING' };
    bots.findByUserIdAndId.mockResolvedValue(b);
    liveTrading.emergencyFlatten.mockRejectedValue(
      new Error('broker unreachable'),
    );

    await expect(service.emergencyStop('user-1', 'bot-1')).rejects.toThrow(
      'broker unreachable',
    );

    expect(b.status).toBe('STOPPED');
  });
});

describe('BotsService lifecycle notifications', () => {
  it('notifies when a bot is started', async () => {
    const { service, bots, runs, notifications } = createService({});
    const b = { ...bot('PAPER'), status: 'DRAFT' };
    bots.findByUserIdAndId.mockResolvedValue(b);
    runs.findActiveByBotId.mockResolvedValue(null);
    runs.save.mockResolvedValue({ id: 'run-9', status: 'STARTING' });

    await service.start('user-1', 'bot-1');

    expect(notifications.notifyUser).toHaveBeenCalledWith('user-1', {
      type: 'BOT_STARTED',
      severity: 'info',
      title: 'Bot "Bolt 1" started',
      body: expect.any(String),
      link: '/bots',
    });
  });

  it('notifies on pause, resume and stop', async () => {
    const { service, bots, runs, notifications } = createService({});
    bots.findByUserIdAndId.mockResolvedValue(bot('PAPER'));
    runs.findActiveByBotId.mockResolvedValue(null);

    await service.pause('user-1', 'bot-1');
    await service.resume('user-1', 'bot-1');
    await service.stop('user-1', 'bot-1');

    const types = notifications.notifyUser.mock.calls.map(
      (call) => call[1].type as string,
    );
    expect(types).toEqual(['BOT_PAUSED', 'BOT_RESUMED', 'BOT_STOPPED']);
  });

  it('emits a CIRCUIT_BREAKER_TRIGGERED error notification on emergency stop', async () => {
    const { service, bots, runs, notifications } = createService({});
    const b = { ...bot('PAPER'), status: 'RUNNING' };
    bots.findByUserIdAndId.mockResolvedValue(b);
    runs.findActiveByBotId.mockResolvedValue({
      id: 'run-1',
      status: 'RUNNING',
    });

    await service.emergencyStop('user-1', 'bot-1');

    expect(notifications.notifyUser).toHaveBeenCalledWith('user-1', {
      type: 'CIRCUIT_BREAKER_TRIGGERED',
      severity: 'error',
      title: expect.stringContaining('Emergency stop'),
      body: expect.any(String),
      link: '/bots',
    });
  });

  it('does not notify when an action is rejected by the state machine', async () => {
    const { service, bots, notifications } = createService({});
    const b = { ...bot('PAPER'), status: 'PAUSED' };
    bots.findByUserIdAndId.mockResolvedValue(b);

    await expect(service.start('user-1', 'bot-1')).rejects.toThrow(
      'Cannot start a bot in status PAUSED',
    );

    expect(notifications.notifyUser).not.toHaveBeenCalled();
  });
});
