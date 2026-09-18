import { describe, expect, it, vi } from 'vitest';
import { LIVE_ORDER_PROVIDERS } from '@trading-bolt/shared';
import { TypeOrmPaperOrderRepository } from './typeorm-paper-trading.repository.js';

type Operator = { _type: string; _value: string[] };
type WhereBranch = Record<string, unknown>;
type ListPendingOptions = { where: WhereBranch[] };

function makeRepo() {
  const find = vi.fn(
    async (_options?: ListPendingOptions): Promise<never[]> => [],
  );
  const repo = { find };
  const impl = new TypeOrmPaperOrderRepository(repo as never);
  return { impl, find };
}

describe('TypeOrmPaperOrderRepository.listPendingLive', () => {
  it('matches non-terminal orders plus unsynced FILLED orders (OR branches)', async () => {
    const { impl, find } = makeRepo();
    await impl.listPendingLive();

    const where = (find.mock.calls[0][0] as ListPendingOptions).where;
    expect(where).toHaveLength(2);

    const pending = where[0];
    expect((pending.provider as Operator)._value).toEqual([
      ...LIVE_ORDER_PROVIDERS,
    ]);
    expect((pending.status as Operator)._type).toBe('in');
    expect((pending.status as Operator)._value).toEqual([
      'SUBMITTED',
      'ACCEPTED',
      'PARTIALLY_FILLED',
    ]);
    expect(pending.accountId).toBeUndefined();

    const filled = where[1];
    expect((filled.provider as Operator)._value).toEqual([
      ...LIVE_ORDER_PROVIDERS,
    ]);
    expect(filled.status).toBe('FILLED');
    expect((filled.lastSyncedAt as Operator)?._type).toBe('isNull');
    expect(filled.accountId).toBeUndefined();
  });

  it('scopes both branches to a single account when asked', async () => {
    const { impl, find } = makeRepo();
    await impl.listPendingLive('acc-9');

    const where = (find.mock.calls[0][0] as ListPendingOptions).where;
    expect(where[0].accountId).toBe('acc-9');
    expect(where[1].accountId).toBe('acc-9');
  });
});
