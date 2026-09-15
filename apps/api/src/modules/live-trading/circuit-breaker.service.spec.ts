import type { RiskAccountState } from '@trading-bolt/risk-engine';
import { describe, expect, it, vi } from 'vitest';
import { CircuitBreakerRepository } from './circuit-breaker.repository.js';
import {
  CircuitBreakerOpenError,
  CircuitBreakerService,
  GLOBAL_BREAKER,
  severityForAccount,
  severityForBot,
} from './circuit-breaker.service.js';

const fixture = (
  overrides: Partial<RiskAccountState> = {},
): RiskAccountState => ({
  equity: '10000',
  realizedPnlToday: '0',
  currentDrawdown: '0',
  openPositions: 1,
  currentExposure: '0.1',
  heldPosition: undefined,
  ...overrides,
});

/** In-memory circuit-breaker repository backed by a map. */
function memoryRepo() {
  const store = new Map<
    string,
    { severity: string; reason: string; trippedAt: number }
  >();
  const repository = {
    store,
    list: vi.fn(async () =>
      [...store.values()].map((entry) => ({
        severity: entry.severity,
        reason: entry.reason,
        trippedAt: new Date(entry.trippedAt),
      })),
    ),
    save: vi.fn(
      async (breaker: {
        severity: string;
        reason: string;
        trippedAt: Date;
      }) => {
        store.set(breaker.severity, {
          severity: breaker.severity,
          reason: breaker.reason,
          trippedAt: breaker.trippedAt.getTime(),
        });
        return breaker;
      },
    ),
    deleteBySeverity: vi.fn(async (severity: string) => {
      store.delete(severity);
    }),
  };
  return {
    repository: repository as unknown as CircuitBreakerRepository,
    store,
  };
}

function create() {
  const { repository, store } = memoryRepo();
  const service = new CircuitBreakerService(repository);
  return { service, repository, store };
}

/** Test-only access to the private breaker registry. */
function registry(service: CircuitBreakerService): {
  trip: (severity: string, reason: string, at?: number) => void;
} {
  return (
    service as unknown as {
      registry: {
        trip: (severity: string, reason: string, at?: number) => void;
      };
    }
  ).registry;
}

describe('CircuitBreakerService', () => {
  describe('onApplicationBootstrap', () => {
    it('restores persisted breakers so a restart never auto-closes a trip', async () => {
      const { service, store } = create();
      store.set('bot:bot-1', {
        severity: 'bot:bot-1',
        reason: 'daily loss',
        trippedAt: Date.now(),
      });

      await service.onApplicationBootstrap();

      expect(service.isOpen('bot:bot-1')).toBe(true);
    });
  });

  describe('openSeverities', () => {
    it('returns nothing while all breakers are CLOSED', async () => {
      const { service } = create();
      expect(service.openSeverities('acc-1', 'bot-1')).toEqual([]);
    });

    it('returns the global, account and bot severities that are OPEN', async () => {
      const { service } = create();
      registry(service).trip(GLOBAL_BREAKER, 'market halted');
      registry(service).trip(severityForAccount('acc-1'), 'daily loss');
      registry(service).trip(severityForBot('bot-2'), 'drawdown');

      expect(service.openSeverities('acc-1', 'bot-1')).toContain(
        GLOBAL_BREAKER,
      );
      expect(service.openSeverities('acc-1', 'bot-1')).toContain(
        severityForAccount('acc-1'),
      );
      expect(service.isOpen(severityForBot('bot-1'))).toBe(false);
    });
  });

  describe('assertTradingAllowed', () => {
    it('is a no-op when account health is within limits', async () => {
      const { service } = create();
      await expect(
        service.assertTradingAllowed('acc-1', 'bot-1', fixture(), {
          maxDailyLoss: '0.05',
          maxDrawdown: '0.2',
        }),
      ).resolves.toBeUndefined();
      expect(service.isOpen(severityForAccount('acc-1'))).toBe(false);
    });

    it('trips and persists the account/bot breakers and throws on a daily-loss breach', async () => {
      const { service, store } = create();
      const facts = fixture({
        equity: '1000',
        realizedPnlToday: '-600',
      });

      await expect(
        service.assertTradingAllowed('acc-1', 'bot-1', facts, {
          maxDailyLoss: '0.05',
        }),
      ).rejects.toThrow(CircuitBreakerOpenError);

      expect(service.isOpen(severityForAccount('acc-1'))).toBe(true);
      expect(service.isOpen(severityForBot('bot-1'))).toBe(true);
      expect(store.has(severityForAccount('acc-1'))).toBe(true);
      expect(store.has(severityForBot('bot-1'))).toBe(true);
    });

    it('trips the breakers and throws on a drawdown breach', async () => {
      const { service } = create();
      await expect(
        service.assertTradingAllowed(
          'acc-1',
          'bot-1',
          fixture({ currentDrawdown: '0.3' }),
          { maxDrawdown: '0.2' },
        ),
      ).rejects.toThrow(CircuitBreakerOpenError);
      expect(service.isOpen(severityForAccount('acc-1'))).toBe(true);
    });
  });

  describe('explicit reset', () => {
    it('closes a tripped breaker and removes it from persistence', async () => {
      const { service, store } = create();
      registry(service).trip(severityForAccount('acc-1'), 'daily loss');
      store.set('account:acc-1', {
        severity: 'account:acc-1',
        reason: 'daily loss',
        trippedAt: Date.now(),
      });
      expect(service.isOpen(severityForAccount('acc-1'))).toBe(true);

      await service.reset(severityForAccount('acc-1'));

      expect(service.isOpen(severityForAccount('acc-1'))).toBe(false);
      expect(store.has(severityForAccount('acc-1'))).toBe(false);
    });
  });

  describe('buildAccountFacts', () => {
    it('derives exposure fraction and held position from broker quantities', () => {
      const { service } = create();
      const facts = service.buildAccountFacts({
        equity: '1000',
        openPositions: 1,
        exposureNotional: '200',
        markPrice: '100',
        heldQuantity: '-2',
      });

      expect(facts.currentExposure).toBe('0.2');
      expect(facts.heldPosition).toEqual({ quantity: '2', side: 'short' });
    });

    it('reports zero exposure when the position is flat', () => {
      const { service } = create();
      const facts = service.buildAccountFacts({
        equity: '1000',
        openPositions: 0,
        exposureNotional: '0',
        markPrice: '100',
      });

      expect(facts.currentExposure).toBe('0');
      expect(facts.heldPosition).toBeUndefined();
    });
  });

  describe('observeAccount', () => {
    it('tracks realized daily P&L and drawdown from observed equity', () => {
      const { service } = create();
      const dayStart = Date.UTC(2026, 0, 1, 0, 0, 0);
      const input = {
        equity: '1000',
        openPositions: 0,
        exposureNotional: '0',
        markPrice: '100',
      };

      const first = service.observeAccount(input, 'acc-1', dayStart);
      expect(first.realizedPnlToday).toBe('0');
      expect(first.currentDrawdown).toBe('0');

      const down = service.observeAccount(
        { ...input, equity: '900' },
        'acc-1',
        dayStart + 60_000,
      );
      expect(down.realizedPnlToday).toBe('-100');
      expect(down.currentDrawdown).toBe('0.1');

      const newDay = service.observeAccount(
        { ...input, equity: '900' },
        'acc-1',
        dayStart + 24 * 3_600_000,
      );
      expect(newDay.realizedPnlToday).toBe('0');
      expect(newDay.currentDrawdown).toBe('0');
    });
  });
});
