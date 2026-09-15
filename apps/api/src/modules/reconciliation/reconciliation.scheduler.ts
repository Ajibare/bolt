import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { BrokersService } from '../brokers/brokers.service.js';
import { ReconciliationProducer } from './reconciliation.producer.js';

/** How often the reconciliation sweep runs while live is configured. */
const RECONCILE_INTERVAL_MS = 30_000;

/**
 * Periodic producer for `order-reconciliation`. Only enqueues when a live
 * broker is configured — with paper-only setups there is nothing to reconcile.
 * The timer is unref'd so it never holds the process open in tests.
 */
@Injectable()
export class ReconciliationScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly producer: ReconciliationProducer,
    private readonly brokers: BrokersService,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setInterval(() => void this.tick(), RECONCILE_INTERVAL_MS);
    timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (!this.brokers.isLiveConfigured()) {
      return;
    }
    await this.producer.enqueue();
  }
}
