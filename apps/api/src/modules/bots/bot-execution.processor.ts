import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { BOT_EXECUTION_QUEUE, type BotTickJob } from '@trading-bolt/shared';
import { BotRunnerService } from './bot-runner.service.js';

/**
 * Consumes `bot-execution` queue ticks and delegates to the runner. The runner
 * owns all state transitions and persistence; this adaptor only bridges the
 * queue. Job failures are logged and leave the bot in ERROR (never silently
 * retried into infinite loops — the runner transitions before raising).
 */
@Injectable()
@Processor(BOT_EXECUTION_QUEUE, { concurrency: 4 })
export class BotExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(BotExecutionProcessor.name);

  constructor(private readonly runner: BotRunnerService) {
    super();
  }

  async process(job: Job<BotTickJob>): Promise<BotTickJob> {
    const outcome = await this.runner.advance(job.data);
    this.logger.debug('BOT_TICK_PROCESSED', {
      botId: outcome.botId,
      runId: outcome.runId,
      action: outcome.action,
      status: outcome.status,
      skipped: outcome.skipped,
      cyclesRun: outcome.cyclesRun,
      ordersPlaced: outcome.ordersPlaced,
      ordersRejected: outcome.ordersRejected,
    });
    return job.data;
  }
}