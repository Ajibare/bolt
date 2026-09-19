import type { LivePortfolioSnapshotEntity } from './live-portfolio-snapshot.entity.js';

/**
 * Persistence port for live-broker portfolio snapshots. Keep TypeORM details
 * out of the snapshot-taking schedule so the recording flow can be tested with
 * mocks, matching the PaperPortfolioRepository pattern.
 */
export abstract class LivePortfolioRepository {
  abstract append(
    snapshot: LivePortfolioSnapshotEntity,
  ): Promise<LivePortfolioSnapshotEntity>;

  /**
   * Every equity snapshot for an account in ascending time order, so the live
   * portfolio equity curve can be rebuilt without querying the broker again.
   */
  abstract listByAccount(
    accountId: string,
  ): Promise<LivePortfolioSnapshotEntity[]>;
}
