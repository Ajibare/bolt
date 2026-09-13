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
import { PaperTradingService } from '../paper-trading/paper-trading.service.js';
import { CreateBotDto } from './dto/create-bot.dto.js';
import { BotEntity, BotRunEntity } from './entities/bot.entity.js';
import { BotRepository, BotRunRepository } from './bot.repository.js';
import { canStart, transition } from './bot-lifecycle.js';
import { BotScheduler } from './bot-scheduler.js';

const PAPER_ONLY_MESSAGE =
  'Only PAPER execution mode is available in the MVP; DEMO/TESTNET/LIVE require broker credentials (Phase 8+)';

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
    private readonly paperTradingService: PaperTradingService,
    private readonly scheduler: BotScheduler,
  ) {}

  async create(userId: string, dto: CreateBotDto): Promise<BotEntity> {
    if (dto.executionMode !== 'PAPER') {
      throw new BadRequestException(PAPER_ONLY_MESSAGE);
    }
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
    bot.executionMode = 'PAPER';
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
      throw new ConflictException(
        `Cannot start a bot in status ${bot.status}`,
      );
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
    return bot;
  }

  async pause(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    bot.status = transition(bot.status, 'PAUSED');
    await this.runsSaveStatus(bot.id, 'PAUSED');
    return this.bots.save(bot);
  }

  async resume(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    bot.status = transition(bot.status, 'RUNNING');
    await this.runsSaveStatus(bot.id, 'RUNNING');
    await this.bots.save(bot);
    const active = await this.runs.findActiveByBotId(bot.id);
    if (active) {
      await this.scheduler.enqueue({
        botId: bot.id,
        runId: active.id,
        action: 'cycle',
        scheduledAt: Date.now(),
      });
    }
    return bot;
  }

  async stop(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    transition(bot.status, 'STOPPING');
    bot.status = transition('STOPPING', 'STOPPED');
    await this.runsStopActive(bot.id);
    return this.bots.save(bot);
  }

  /** Explicit recovery from a failure — bots never resume from ERROR automatically. */
  async recover(userId: string, botId: string): Promise<BotEntity> {
    const bot = await this.ownedBot(userId, botId);
    bot.status = transition(bot.status, 'STOPPED');
    await this.runsStopActive(bot.id);
    return this.bots.save(bot);
  }

  async listRuns(
    userId: string,
    botId: string,
  ): Promise<BotRunEntity[]> {
    await this.ownedBot(userId, botId);
    return this.runs.listByBotId(botId, { limit: 20 });
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