import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { toDecimal } from '@trading-bolt/shared';
import {
  createStrategy,
  InvalidStrategyConfigError,
  StrategyNotFoundError,
} from '@trading-bolt/trading-engine';
import { validateRiskConfig, type RiskConfig } from '@trading-bolt/risk-engine';
import { BrokersService } from '../brokers/brokers.service.js';
import { LiveTradingService } from '../live-trading/live-trading.service.js';
import { PaperTradingService } from '../paper-trading/paper-trading.service.js';
import { CreateBotDto } from './dto/create-bot.dto.js';
import {
  BotEntity,
  BotRunCycleEntity,
  BotRunEntity,
} from './entities/bot.entity.js';
import {
  BotRepository,
  BotRunCycleRepository,
  BotRunRepository,
} from './bot.repository.js';
import { canStart, transition } from './bot-lifecycle.js';
import { BotScheduler } from './bot-scheduler.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/** Execution modes that run against the live broker (AGENTS.md §11). */
const LIVE_EXECUTION_MODES = ['DEMO', 'TESTNET', 'LIVE'] as const;

/**
 * A bot's execution mode must match the configured broker environment so a
 * "demo" bot can never route real orders to mainnet (fail-closed). DEMO is a
 * Bybit-only capability; Binance does not offer a demo environment.
 */
const LIVE_MODE_TO_BROKER_ENVIRONMENT: Record<
  (typeof LIVE_EXECUTION_MODES)[number],
  'demo' | 'testnet' | 'mainnet'
> = {
  DEMO: 'demo',
  TESTNET: 'testnet',
  LIVE: 'mainnet',
};

export interface BotMonitorView {
  bot: BotEntity;
  activeRun: BotRunEntity | null;
  portfolio: {
    equity: string;
    cash: string;
    positionValue: string;
    realizedPnl: string;
  };
  position: {
    symbol: string;
    quantity: string;
    avgEntryPrice: string;
    markPrice: string;
    unrealizedPnl: string;
  } | null;
}

/**
 * Bot lifecycle management: drafting, starting/stopping/pausing/resuming, and
 * monitoring. Only this service may mutate bot state — every change goes
 * through the bot lifecycle state machine and is persisted (AGENTS.md §18/§23,
 * roadmap §Bot Lifecycle).
 */
@Injectable()
export class BotsService {
  constructor(
    private readonly bots: BotRepository,
    private readonly runs: BotRunRepository,
    private readonly cycles: BotRunCycleRepository,
    private readonly paperTradingService: PaperTradingService,
    private readonly scheduler: BotScheduler,
    private readonly brokers: BrokersService,
    private readonly liveTrading: LiveTradingService,
    private readonly notifications: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateBotDto): Promise<BotEntity> {
    this.assertExecutionModeAllowed(dto.executionMode);
    this.validateStrategy(dto.strategyId, dto.config);
    if (dto.riskConfig !== undefined) {
      try {
        validateRiskConfig(dto.riskConfig as Partial<RiskConfig>);
      } catch (error) {
        throw new BadRequestException(
          `Invalid risk configuration: ${(error as Error).message}`,
        );
      }
    }
    this.validatePercentage('stopLossPercent', dto.stopLossPercent);
    if (dto.takeProfitPercent !== undefined) {
      this.validatePercentage('takeProfitPercent', dto.takeProfitPercent);
    }

    const owned = await this.paperTradingService.listAccounts(userId);
    if (!owned.some((account) => account.id === dto.paperAccountId)) {
      throw new BadRequestException('Paper account not found');
    }

    const bot = new BotEntity();
    bot.userId = userId;
    bot.name = dto.name;
    bot.strategyId = dto.strategyId;
    bot.config = dto.config;
    bot.symbol = dto.symbol;
    bot.interval = dto.interval;
    bot.riskConfig = dto.riskConfig ?? {};
    bot.paperAccountId = dto.paperAccountId;
    bot.executionMode = dto.executionMode as BotEntity['executionMode'];
    bot.status = 'DRAFT';
    bot.quantity = dto.quantity;
    bot.stopLossPercent = dto.stopLossPercent;
    bot.takeProfitPercent = dto.takeProfitPercent ?? null;
    bot.lastError = null;
    return this.bots.save(bot);
  }

  list(userId: string): Promise<BotEntity[]> {
    return this.bots.listByUserId(userId);
  }

  async get(userId: string, botId: string): Promise<BotEntity> {
    return this.ownedBot(userId, botId);
  }

  async start(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    if (!canStart(bot.status)) {
      throw new ConflictException(`Cannot start a bot in status ${bot.status}`);
    }
    const active = await this.runs.findActiveByBotId(bot.id);
    if (active) {
      throw new ConflictException('Bot already has an active run');
    }
    bot.status = transition(bot.status, 'STARTING');

    const run = new BotRunEntity();
    run.botId = bot.id;
    run.status = 'STARTING';
    run.startedAt = new Date();
    const persistedRun = await this.runs.save(run);

    await this.bots.save(bot);
    await this.scheduler.enqueue({
      botId: bot.id,
      runId: persistedRun.id,
      action: 'start',
      scheduledAt: Date.now(),
    });
    await this.notify(
      bot,
      'info',
      'BOT_STARTED',
      `Bot "${bot.name}" started`,
      `Execution mode ${bot.executionMode} on ${bot.symbol} (${bot.interval})`,
    );
    return bot;
  }

  async pause(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    bot.status = transition(bot.status, 'PAUSED');
    await this.runsSaveStatus(bot.id, 'PAUSED');
    const saved = await this.bots.save(bot);
    await this.notify(
      saved,
      'info',
      'BOT_PAUSED',
      `Bot "${saved.name}" paused`,
      `${saved.symbol} (${saved.interval}) paused — no new signals are executed.`,
    );
    return saved;
  }

  async resume(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    bot.status = transition(bot.status, 'RUNNING');
    await this.runsSaveStatus(bot.id, 'RUNNING');
    const saved = await this.bots.save(bot);
    const active = await this.runs.findActiveByBotId(bot.id);
    if (active) {
      await this.scheduler.enqueue({
        botId: bot.id,
        runId: active.id,
        action: 'cycle',
        scheduledAt: Date.now(),
      });
    }
    await this.notify(
      saved,
      'info',
      'BOT_RESUMED',
      `Bot "${saved.name}" resumed`,
      `${saved.symbol} (${saved.interval}) is running again.`,
    );
    return saved;
  }

  async stop(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    transition(bot.status, 'STOPPING');
    bot.status = transition('STOPPING', 'STOPPED');
    await this.runsStopActive(bot.id);
    const saved = await this.bots.save(bot);
    await this.notify(
      saved,
      'info',
      'BOT_STOPPED',
      `Bot "${saved.name}" stopped`,
      `${saved.symbol} (${saved.interval}) is no longer running.`,
    );
    return saved;
  }

  /**
   * Emergency stop (AGENTS.md §19): flattens the broker-held position for a
   * live bot (reduce-only, never blocked by the circuit breaker), cancels its
   * open orders, and always stops the bot — even if flattening fails, the bot
   * can no longer submit new orders.
   */
  async emergencyStop(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    try {
      if (bot.executionMode !== 'PAPER') {
        await this.liveTrading.emergencyFlatten({
          accountId: bot.paperAccountId,
          botId: bot.id,
          symbol: bot.symbol,
        });
      }
    } finally {
      transition(bot.status, 'STOPPING');
      bot.status = transition('STOPPING', 'STOPPED');
      await this.runsStopActive(bot.id);
      const saved = await this.bots.save(bot);
      await this.notify(
        saved,
        'error',
        'CIRCUIT_BREAKER_TRIGGERED',
        `Emergency stop on "${saved.name}"`,
        `All open orders and the position were flattened before the bot stopped (AGENTS.md §19).`,
      );
    }
    return bot;
  }

  /** Explicit recovery from a failure — bots never resume from ERROR automatically. */
  async recover(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    bot.status = transition(bot.status, 'STOPPED');
    await this.runsStopActive(bot.id);
    return this.bots.save(bot);
  }

  async listRuns(userId: string, botId: string): Promise<BotRunEntity[]> {
    await this.ownedBot(userId, botId);
    return this.runs.listByBotId(botId, { limit: 20 });
  }

  async listRunCycles(
    userId: string,
    botId: string,
    runId: string,
  ): Promise<BotRunCycleEntity[]> {
    const bot = await this.ownedBot(userId, botId);
    const run = await this.runs.findById(runId);
    if (!run || run.botId !== bot.id) {
      throw new NotFoundException('Bot run not found');
    }
    return this.cycles.listByRunId(runId, { limit: 50 });
  }

  async monitor(userId: string, botId: string): Promise<BotMonitorView> {
    const bot = await this.ownedBot(userId, botId);
    const activeRun = await this.runs.findActiveByBotId(bot.id);
    const portfolio = await this.paperTradingService.getPortfolio(
      userId,
      bot.paperAccountId,
    );
    const positions = await this.paperTradingService.getPositions(
      userId,
      bot.paperAccountId,
    );
    const held = positions.find((p) => p.symbol === bot.symbol) ?? null;

    return {
      bot,
      activeRun,
      portfolio: {
        equity: portfolio.equity,
        cash: portfolio.cash,
        positionValue: portfolio.positionValue,
        realizedPnl: portfolio.realizedPnl,
      },
      position: held
        ? {
            symbol: held.symbol,
            quantity: held.quantity,
            avgEntryPrice: held.avgEntryPrice,
            markPrice: held.markPrice,
            unrealizedPnl: held.unrealizedPnl,
          }
        : null,
    };
  }

  private async ownedBot(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.bots.findByUserIdAndId(userId, botId);
    if (!bot) {
      throw new NotFoundException('Bot not found');
    }
    return bot;
  }

  /** Persists an in-app notification for the bot's owner (AGENTS.md §25). */
  private async notify(
    bot: BotEntity,
    severity: 'info' | 'warn' | 'error',
    type: string,
    title: string,
    body: string,
  ): Promise<void> {
    await this.notifications.notifyUser(bot.userId, {
      type,
      severity,
      title,
      body,
      link: '/bots',
    });
  }

  private async runsSaveStatus(
    botId: string,
    status: 'RUNNING' | 'PAUSED',
  ): Promise<void> {
    const active = await this.runs.findActiveByBotId(botId);
    if (active && active.status !== status) {
      active.status = status;
      await this.runs.save(active);
    }
  }

  private async runsStopActive(botId: string): Promise<void> {
    const active = await this.runs.findActiveByBotId(botId);
    if (active) {
      active.status = 'STOPPED';
      active.stoppedAt = new Date();
      await this.runs.save(active);
    }
  }

  private assertExecutionModeAllowed(executionMode: string): void {
    if (executionMode === 'PAPER') {
      return;
    }
    if (executionMode === 'BACKTEST') {
      throw new BadRequestException(
        'BACKTEST execution is not available on bots — run a backtest instead',
      );
    }
    const expectedEnvironment =
      LIVE_MODE_TO_BROKER_ENVIRONMENT[
        executionMode as keyof typeof LIVE_MODE_TO_BROKER_ENVIRONMENT
      ];
    if (!expectedEnvironment) {
      throw new BadRequestException(
        `Unsupported execution mode: ${executionMode}`,
      );
    }
    if (!this.brokers.isLiveConfigured()) {
      throw new BadRequestException(
        `Execution mode ${executionMode} requires live broker credentials ` +
          `(BINANCE_API_KEY/BINANCE_API_SECRET, or BYBIT_API_KEY/BYBIT_API_SECRET for demo)`,
      );
    }
    const configuredEnvironment = this.brokers.environment();
    if (configuredEnvironment !== expectedEnvironment) {
      throw new BadRequestException(
        `Execution mode ${executionMode} is incompatible with the configured ` +
          `broker environment "${configuredEnvironment}" (requires "${expectedEnvironment}")`,
      );
    }
  }

  private validateStrategy(strategyId: string, config: unknown): void {
    try {
      createStrategy(strategyId, config);
    } catch (error) {
      if (error instanceof StrategyNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InvalidStrategyConfigError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }

  private validatePercentage(label: string, value: string): void {
    const parsed = toDecimal(value);
    if (parsed.lte(0) || parsed.gte(1)) {
      throw new BadRequestException(
        `${label} must be a fraction strictly between 0 and 1 (0.01 = 1%)`,
      );
    }
  }
}
