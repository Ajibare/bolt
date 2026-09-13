import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { BotStatus, BotTickAction, BotTickJob } from '@trading-bolt/shared';
import {
  createStrategy,
  InvalidStrategyConfigError,
  StrategyNotFoundError,
} from '@trading-bolt/trading-engine';
import { MarketsService } from '../markets/markets.service.js';
import { PlacePaperOrderDto } from '../paper-trading/dto/place-paper-order.dto.js';
import { PaperTradingService } from '../paper-trading/paper-trading.service.js';
import { BotEntity, BotRunEntity } from './entities/bot.entity.js';
import { BotRepository, BotRunRepository } from './bot.repository.js';
import { buildCycleIntent } from './bot-cycle.js';
import { transition } from './bot-lifecycle.js';
import { intervalToMs } from './bot-timing.js';
import { BotScheduler } from './bot-scheduler.js';

const CYCLE_CANDLE_LIMIT = 200;
const RISK_REJECTION_MESSAGE = 'rejected by risk engine';

export interface BotAdvanceOutcome {
  botId: string;
  runId: string;
  action: BotTickAction;
  skipped: boolean;
  status: BotStatus;
  cyclesRun: number;
  ordersPlaced: number;
  ordersRejected: number;
  error: string | null;
}

/**
 * Executes one bot tick: settle resting paper limits, fetch candles, evaluate
 * the strategy, and — when the signal is actionable — submit a risk-gated
 * paper order (AGENTS.md §9/§10). Runs inside the `bot-execution` worker
 * processor for `start` ticks and each subsequent `cycle` tick.
 *
 * Failure handling is conservative (§19 / roadmap): a risk rejection simply
 * counts and the bot keeps running, but any unexpected failure flips the bot
 * to ERROR and never silently continues.
 */
@Injectable()
export class BotRunnerService {
  private readonly logger = new Logger(BotRunnerService.name);

  constructor(
    private readonly bots: BotRepository,
    private readonly runs: BotRunRepository,
    private readonly marketsService: MarketsService,
    private readonly paperTradingService: PaperTradingService,
    private readonly scheduler: BotScheduler,
  ) {}

  async advance(job: BotTickJob): Promise<BotAdvanceOutcome> {
    const bot = await this.bots.findById(job.botId);
    if (!bot) {
      throw new NotFoundException(`Bot ${job.botId} not found`);
    }
    const run = await this.runs.findById(job.runId);
    if (!run) {
      throw new NotFoundException(`Bot run ${job.runId} not found`);
    }
    if (run.botId !== bot.id) {
      throw new ConflictException('Run does not belong to bot');
    }

    if (job.action === 'start') {
      if (bot.status === 'STARTING') {
        bot.status = transition('STARTING', 'RUNNING');
        run.status = 'RUNNING';
        run.startedAt = run.startedAt ?? new Date();
      } else if (bot.status === 'RUNNING') {
        run.status = 'RUNNING';
      } else {
        throw new ConflictException(
          `Cannot start a bot in status ${bot.status}`,
        );
      }
    } else if (bot.status !== 'RUNNING' || run.status === 'PAUSED') {
      return {
        botId: bot.id,
        runId: run.id,
        action: job.action,
        skipped: true,
        status: bot.status,
        cyclesRun: run.cyclesRun,
        ordersPlaced: run.ordersPlaced,
        ordersRejected: run.ordersRejected,
        error: run.error,
      };
    }

    await this.runOneCycle(bot, run);
    await this.bots.save(bot);
    await this.runs.save(run);

    if (bot.status === 'RUNNING') {
      const delayMs = intervalToMs(bot.interval);
      await this.scheduler.enqueue(
        {
          botId: bot.id,
          runId: run.id,
          action: 'cycle',
          scheduledAt: Date.now() + delayMs,
        },
        { delayMs },
      );
    }

    return {
      botId: bot.id,
      runId: run.id,
      action: job.action,
      skipped: false,
      status: bot.status,
      cyclesRun: run.cyclesRun,
      ordersPlaced: run.ordersPlaced,
      ordersRejected: run.ordersRejected,
      error: run.error,
    };
  }

  private async runOneCycle(
    bot: BotEntity,
    run: BotRunEntity,
  ): Promise<void> {
    try {
      await this.paperTradingService.settleLimitOrders(
        bot.userId,
        bot.paperAccountId,
      );

      const candles = await this.marketsService.getCandles(
        bot.symbol,
        bot.interval,
        CYCLE_CANDLE_LIMIT,
      );

      let strategy;
      try {
        strategy = createStrategy(bot.strategyId, bot.config);
      } catch (error) {
        if (
          error instanceof StrategyNotFoundError ||
          error instanceof InvalidStrategyConfigError
        ) {
          throw new Error(
            `Invalid strategy "${bot.strategyId}": ${(error as Error).message}`,
          );
        }
        throw error;
      }

      const signal = strategy.evaluate(candles);
      bot.lastSignalDirection = signal.direction;
      bot.lastSignalReason = signal.reason;
      bot.lastSignalAt = new Date(signal.timestamp);

      const ticker = await this.marketsService.getTicker(bot.symbol);
      if (ticker) {
        const positions = await this.paperTradingService.getPositions(
          bot.userId,
          bot.paperAccountId,
        );
        const held = positions.find((p) => p.symbol === bot.symbol);
        const intent = buildCycleIntent(
          {
            quantity: bot.quantity,
            stopLossPercent: bot.stopLossPercent,
            takeProfitPercent: bot.takeProfitPercent,
          },
          signal.direction,
          ticker.lastPrice,
          held ? held.quantity : null,
        );

        if (intent) {
          await this.submitCycleOrder(bot, run, intent, signal.timestamp);
        }
      }

      run.cyclesRun += 1;
      run.lastCycleAt = new Date();
      bot.lastError = null;
    } catch (error) {
      const message = (error as Error).message ?? 'Unknown bot cycle error';
      this.logger.error('BOT_CYCLE_FAILED', {
        botId: bot.id,
        runId: run.id,
        error: message,
      });
      if (bot.status === 'RUNNING') {
        bot.status = transition('RUNNING', 'ERROR');
      } else if (bot.status === 'STARTING') {
        bot.status = transition('STARTING', 'ERROR');
      }
      run.status = 'ERROR';
      run.error = message;
      bot.lastError = message;
    }
  }

  private async submitCycleOrder(
    bot: BotEntity,
    run: BotRunEntity,
    intent: { side: 'buy' | 'sell'; quantity: string; reduceOnly: boolean; stopLoss?: string; takeProfit?: string },
    signalTimestamp: number,
  ): Promise<void> {
    const dto: PlacePaperOrderDto = {
      symbol: bot.symbol,
      side: intent.side,
      type: 'market',
      quantity: intent.quantity,
      stopLoss: intent.stopLoss,
      takeProfit: intent.takeProfit,
      reduceOnly: intent.reduceOnly,
      clientOrderId: `${run.id}:${signalTimestamp}`,
    };

    try {
      const order = await this.paperTradingService.placeOrder(
        bot.userId,
        bot.paperAccountId,
        dto,
      );
      bot.lastOrderId = order.id;
      bot.lastOrderStatus = order.status;
      bot.lastOrderSymbol = order.symbol;
      run.ordersPlaced += 1;
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        error.message.includes(RISK_REJECTION_MESSAGE)
      ) {
        run.ordersRejected += 1;
        return;
      }
      throw error;
    }
  }
}