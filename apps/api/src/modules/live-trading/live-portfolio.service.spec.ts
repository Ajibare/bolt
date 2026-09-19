import { describe, expect, it, vi } from 'vitest';
import type { BrokerAccountState } from '@trading-bolt/broker-adapters';
import { LivePortfolioService } from './live-portfolio.service.js';

function makeService(
  overrides: {
    adapter?: { getAccountState: ReturnType<typeof vi.fn> } | null;
  } = {},
) {
  const brokers = {
    getLiveAdapter: vi.fn(() => overrides.adapter ?? null),
  };
  const orders = {
    listLiveAccounts: vi.fn(async (): Promise<string[]> => []),
  };
  const portfolios = {
    listByAccount: vi.fn(),
    append: vi.fn(async (snapshot: unknown) => snapshot),
  };
  const service = new LivePortfolioService(
    brokers as never,
    orders as never,
    portfolios as never,
  );
  return { service, brokers, orders, portfolios };
}

function stateFor(
  balances: BrokerAccountState['balances'],
): BrokerAccountState {
  return { balances };
}

describe('LivePortfolioService.recordSnapshot', () => {
  it('returns null when no live broker is configured', async () => {
    const { service, portfolios } = makeService();
    const result = await service.recordSnapshot('acc-1');

    expect(result).toBeNull();
    expect(portfolios.append).not.toHaveBeenCalled();
  });

  it('writes a snapshot summing broker totals and free balances', async () => {
    const adapter = {
      getAccountState: vi.fn(async () =>
        stateFor([
          { asset: 'USDT', free: '8000', used: '2000', total: '10000' },
          { asset: 'BTC', free: '0', used: '0', total: '0' },
        ]),
      ),
    };
    const { service, portfolios } = makeService({ adapter });
    const result = await service.recordSnapshot('acc-1');

    expect(portfolios.append).toHaveBeenCalledWith(
      expect.objectContaining({
        accountId: 'acc-1',
        equity: '10000',
        cash: '8000',
        positionValue: '0',
        realizedPnl: '0',
      }),
    );
    expect(result).not.toBeNull();
  });

  it('skips and does not persist when the broker is unreadable', async () => {
    const adapter = {
      getAccountState: vi.fn(async () => {
        throw new Error('broker down');
      }),
    };
    const { service, portfolios } = makeService({ adapter });
    const result = await service.recordSnapshot('acc-1');

    expect(result).toBeNull();
    expect(portfolios.append).not.toHaveBeenCalled();
  });
});

describe('LivePortfolioService.recordAll', () => {
  it('snapshots every account with live activity', async () => {
    const adapter = {
      getAccountState: vi.fn(async () =>
        stateFor([{ asset: 'USDT', free: '10000', used: '0', total: '10000' }]),
      ),
    };
    const { service, orders, portfolios } = makeService({ adapter });
    orders.listLiveAccounts.mockResolvedValue(['acc-1', 'acc-2'] as never);

    const written = await service.recordAll();

    expect(written).toBe(2);
    expect(portfolios.append).toHaveBeenCalledTimes(2);
  });

  it('writes nothing when there is no live activity', async () => {
    const { service, portfolios } = makeService();
    const written = await service.recordAll();

    expect(written).toBe(0);
    expect(portfolios.append).not.toHaveBeenCalled();
  });
});
