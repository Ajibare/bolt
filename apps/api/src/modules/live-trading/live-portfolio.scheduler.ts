import { Injectable, type OnApplicationBootstrap } from '@nestjs/common';
import { BrokersService } from '../brokers/brokers.service.js';
import { LivePortfolioService } from './live-portfolio.service.js';

/** How often live equity snapshots are recorded while a broker is configured. */
const SNAPSHOT_INTERVAL_MS = 60_000;

/**
 * Periodic producer of live portfolio snapshots. Only runs when a live broker
 * is configured — with paper-only setups there is no broker state to observe.
 * The timer is unref'd so it never holds the process open in tests.
 */
@Injectable()
export class LivePortfolioScheduler implements OnApplicationBootstrap {
  constructor(
    private readonly portfolios: LivePortfolioService,
    private readonly brokers: BrokersService,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setInterval(() => void this.tick(), SNAPSHOT_INTERVAL_MS);
    timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (!this.brokers.isLiveConfigured()) {
      return;
    }
    await this.portfolios.recordAll();
  }
}
