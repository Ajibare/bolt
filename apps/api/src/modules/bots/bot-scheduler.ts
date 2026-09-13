import { BOT_EXECUTION_QUEUE, type BotTickAction } from '@trading-bolt/shared';
import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import type { BotTickJob } from '@trading-bolt/shared';

/**
 * Scheduling port for bot ticks. The production implementation enqueues onto
 * the `bot-execution` BullMQ queue; tests substitute a fake. The bot engine is
 * the ONLY producer of tick jobs while a bot is RUNNING.
 */
export abstract class BotScheduler {
  abstract enqueue(
    job: BotTickJob,
    options?: { delayMs?: number },
  ): Promise<void>;
}

@Injectable()
export class BullMqBotScheduler extends BotScheduler {
  constructor(
    @InjectQueue(BOT_EXECUTION_QUEUE)
    private readonly queue: Queue<BotTickJob>,
  ) {
    super();
  }

  async enqueue(
    job: BotTickJob,
    options?: { delayMs?: number },
  ): Promise<void> {
    await this.queue.add(
      'bot-tick',
      job,
      {
        jobId: `${job.runId}:${job.action}`,
        delay: options?.delayMs ?? 0,
        removeOnComplete: 500,
        removeOnFail: 1000,
      },
    );
  }
}