import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import {
  ORDER_RECONCILIATION_QUEUE,
  type ReconciliationJob,
  type ReconciliationRunOutcome,
} from '@trading-bolt/shared';
import { PositionReconciliationService } from './position-reconciliation.service.js';
import { OrderReconciliationService } from './reconciliation.service.js';

/**
 * Consumes `order-reconciliation` jobs. The periodic sweep and any caller
 * enqueue jobs here; the services own all ledger writes and mismatch logging.
 * Each run performs the order pass (fills + status convergence) followed by
 * the position pass (local ledger vs broker held positions, AGENTS.md §17).
 */
@Injectable()
@Processor(ORDER_RECONCILIATION_QUEUE, { concurrency: 1 })
export class ReconciliationProcessor extends WorkerHost {
  constructor(
    private readonly reconciliation: OrderReconciliationService,
    private readonly positions: PositionReconciliationService,
  ) {
    super();
  }

  async process(
    job: Job<ReconciliationJob>,
  ): Promise<ReconciliationRunOutcome> {
    const outcome = await this.reconciliation.reconcile(job.data);
    const positions = await this.positions.reconcile(job.data);
    return { ...outcome, positions };
  }
}
