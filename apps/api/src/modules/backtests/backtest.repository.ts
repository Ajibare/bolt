import type { BacktestEntity } from './entities/backtest.entity.js';

/**
 * Persistence port for backtest runs. Keeps TypeORM details out of the
 * service so `save` / `findById` can be tested with a mock, matching the
 * MarketCandleRepository pattern.
 */
export abstract class BacktestRepository {
  abstract save(backtest: BacktestEntity): Promise<BacktestEntity>;

  abstract findById(id: string): Promise<BacktestEntity | null>;

  abstract list(limit: number): Promise<BacktestEntity[]>;
}
