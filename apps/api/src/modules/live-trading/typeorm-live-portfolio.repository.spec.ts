import { describe, expect, it, vi } from 'vitest';
import { TypeOrmLivePortfolioRepository } from './typeorm-live-portfolio.repository.js';
import { LivePortfolioSnapshotEntity } from './live-portfolio-snapshot.entity.js';

describe('TypeOrmLivePortfolioRepository', () => {
  type FindOptions = {
    where: { accountId: string };
    order: { createdAt: 'ASC' };
  };

  function makeRepo() {
    const find = vi.fn(async (_options?: FindOptions): Promise<never[]> => []);
    const save = vi.fn(
      async (snapshot: LivePortfolioSnapshotEntity) => snapshot,
    );
    const repo = { find, save };
    const impl = new TypeOrmLivePortfolioRepository(repo as never);
    return { impl, find, save };
  }

  it('queries snapshots for an account in ascending time order', async () => {
    const { impl, find } = makeRepo();
    await impl.listByAccount('acc-7');

    const options = find.mock.calls[0][0] as FindOptions;
    expect(options.where.accountId).toBe('acc-7');
    expect(options.order.createdAt).toBe('ASC');
  });

  it('persists an appended snapshot', async () => {
    const { impl, save } = makeRepo();
    const snapshot = new LivePortfolioSnapshotEntity();
    snapshot.accountId = 'acc-7';
    snapshot.equity = '1000';
    snapshot.cash = '800';
    snapshot.positionValue = '0';
    snapshot.realizedPnl = '0';

    await impl.append(snapshot);

    expect(save).toHaveBeenCalledWith(snapshot);
  });
});
