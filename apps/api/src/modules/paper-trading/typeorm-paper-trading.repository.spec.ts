import { describe, expect, it, vi } from 'vitest';
import { LIVE_ORDER_PROVIDERS } from '@trading-bolt/shared';
import {
  TypeOrmPaperOrderRepository,
  TypeOrmPaperPortfolioRepository,
} from './typeorm-paper-trading.repository.js';

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

describe('TypeOrmPaperOrderRepository.listFilledByAccount', () => {
  type FilledFindOptions = {
    where: Record<string, unknown>;
    order: { createdAt: 'ASC' };
    take?: number;
  };

  function makeOrderRepo() {
    const find = vi.fn(
      async (_options?: FilledFindOptions): Promise<never[]> => [],
    );
    const repo = { find };
    const impl = new TypeOrmPaperOrderRepository(repo as never);
    return { impl, find };
  }

  it('scopes to the account and selects orders with a positive fill, ascending', async () => {
    const { impl, find } = makeOrderRepo();
    await impl.listFilledByAccount('acc-5', 5000);

    const options = find.mock.calls[0][0] as FilledFindOptions;
    expect(options.where.accountId).toBe('acc-5');
    const operator = options.where.filledQuantity as {
      _type: string;
      _value: string;
    };
    expect(operator._type).toBe('moreThan');
    expect(operator._value).toBe('0');
    expect(options.order.createdAt).toBe('ASC');
    expect(options.take).toBe(5000);
  });
});

describe('TypeOrmPaperOrderRepository.listFilledByAccountAndBot', () => {
  type BotFilledFindOptions = {
    where: Record<string, unknown>;
    order: { createdAt: 'ASC' };
    take?: number;
  };

  function makeOrderRepo() {
    const find = vi.fn(
      async (_options?: BotFilledFindOptions): Promise<never[]> => [],
    );
    const repo = { find };
    const impl = new TypeOrmPaperOrderRepository(repo as never);
    return { impl, find };
  }

  it('scopes to account and bot with a positive fill, ascending', async () => {
    const { impl, find } = makeOrderRepo();
    await impl.listFilledByAccountAndBot('acc-5', 'bot-2', 5000);

    const options = find.mock.calls[0][0] as BotFilledFindOptions;
    expect(options.where.accountId).toBe('acc-5');
    expect(options.where.botId).toBe('bot-2');
    const operator = options.where.filledQuantity as {
      _type: string;
      _value: string;
    };
    expect(operator._type).toBe('moreThan');
    expect(operator._value).toBe('0');
    expect(options.order.createdAt).toBe('ASC');
    expect(options.take).toBe(5000);
  });
});

describe('TypeOrmPaperOrderRepository.listFilledByBotIds', () => {
  type BotIdsFindOptions = {
    where: Record<string, unknown>;
    order: { createdAt: 'ASC' };
    take?: number;
  };

  function makeOrderRepo() {
    const find = vi.fn(
      async (_options?: BotIdsFindOptions): Promise<never[]> => [],
    );
    const repo = { find };
    const impl = new TypeOrmPaperOrderRepository(repo as never);
    return { impl, find };
  }

  it('matches any of the bot ids with a positive fill, ascending', async () => {
    const { impl, find } = makeOrderRepo();
    await impl.listFilledByBotIds(['bot-1', 'bot-2'], 5000);

    const options = find.mock.calls[0][0] as BotIdsFindOptions;
    const operator = options.where.botId as { _type: string; _value: string[] };
    expect(operator._type).toBe('in');
    expect(operator._value).toEqual(['bot-1', 'bot-2']);
    expect((options.where.filledQuantity as { _type: string })._type).toBe(
      'moreThan',
    );
    expect(options.order.createdAt).toBe('ASC');
    expect(options.take).toBe(5000);
  });

  it('returns an empty list without querying when no bot ids are given', async () => {
    const { impl, find } = makeOrderRepo();
    await expect(impl.listFilledByBotIds([])).resolves.toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });
});

describe('TypeOrmPaperPortfolioRepository.listByAccount', () => {
  type PortfolioFindOptions = {
    where: { accountId: string };
    order: { createdAt: 'ASC' };
  };

  function makePortfolioRepo() {
    const find = vi.fn(
      async (_options?: PortfolioFindOptions): Promise<never[]> => [],
    );
    const repo = { find };
    const impl = new TypeOrmPaperPortfolioRepository(repo as never);
    return { impl, find };
  }

  it('queries snapshots for an account in ascending time order', async () => {
    const { impl, find } = makePortfolioRepo();
    await impl.listByAccount('acc-7');

    const options = find.mock.calls[0][0] as PortfolioFindOptions;
    expect(options.where.accountId).toBe('acc-7');
    expect(options.order.createdAt).toBe('ASC');
  });
});
