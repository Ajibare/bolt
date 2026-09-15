import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import {
  ORDER_RECONCILIATION_QUEUE,
  type ReconciliationJob,
} from '@trading-bolt/shared';

/**
 * Queue producer for `order-reconciliation`. Callers enqueue a sweep after
 * placing a live order so fills converge quickly instead of waiting for the
 * periodic scheduler.
 */
@Injectable()
export class ReconciliationProducer {
  constructor(
    @InjectQueue(ORDER_RECONCILIATION_QUEUE)
    private readonly queue: Queue<ReconciliationJob>,
  ) {}

  async enqueue(accountId?: string, delayMs = 0): Promise<void> {
    await this.queue.add('reconcile', accountId ? { accountId } : {}, {
      delay: delayMs,
      removeOnComplete: 50,
      removeOnFail: 500,
    });
  }
}
