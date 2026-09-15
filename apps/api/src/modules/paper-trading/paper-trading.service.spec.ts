import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { PaperTradingService } from './paper-trading.service.js';
import { PlacePaperOrderDto } from './dto/place-paper-order.dto.js';
import type {
  PaperAccountEntity,
  PaperOrderEntity,
  PaperPositionEntity,
} from './entities/paper-trading.entity.js';

function account(
  overrides: Partial<PaperAccountEntity> = {},
): PaperAccountEntity {
  return {
    id: 'acc-1',
    userId: 'user-1',
    name: 'Primary',
    status: 'ACTIVE',
    startingCash: '10000',
    freeCash: '10000',
    realizedPnl: '0',
    totalFeesPaid: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaperAccountEntity;
}

function position(
  overrides: Partial<PaperPositionEntity> = {},
): PaperPositionEntity {
  return {
    id: 'pos-1',
    accountId: 'acc-1',
    symbol: 'BTCUSDT',
    side: 'long',
    quantity: '1',
    avgEntryPrice: '100',
    fees: '0.1',
    realizedPnl: '0',
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaperPositionEntity;
}

function restingOrder(
  overrides: Partial<PaperOrderEntity> = {},
): PaperOrderEntity {
  return {
    id: 'order-rest-1',
    accountId: 'acc-1',
    clientOrderId: 'rest-key',
    brokerOrderId: 'broker-rest-1',
    side: 'buy',
    type: 'limit',
    symbol: 'BTCUSDT',
    quantity: '1',
    price: '99',
    stopLoss: null,
    takeProfit: null,
    reduceOnly: false,
    feeRate: '0.001',
    slippageRate: '0',
    status: 'ACCEPTED',
    filledQuantity: '0',
    avgFillPrice: null,
    fees: '0',
    reason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as PaperOrderEntity;
}

function createService() {
  const accountsRepo = {
    save: vi.fn(async (entity: PaperAccountEntity) => entity),
    findById: vi.fn(),
    findByUserIdAndId: vi.fn(),
    listByUserId: vi.fn(async () => []),
  };
  const ordersRepo = {
    save: vi.fn(async (entity: PaperOrderEntity) => entity),
    findById: vi.fn(),
    findByAccountAndClientOrderId: vi.fn(async () => null),
    listByAccount: vi.fn(async () => []),
  };
  // Position persistence is stateful so re-reads after a fill mirror the DB.
  const positionStore: PaperPositionEntity[] = [];
  const positionsRepo = {
    save: vi.fn(async (entity: PaperPositionEntity) => {
      positionStore.splice(0, positionStore.length);
      positionStore.push(entity);
      return entity;
    }),
    findByAccountAndSymbol: vi.fn(),
    deleteByAccountAndSymbol: vi.fn(async () => {
      positionStore.splice(0, positionStore.length);
    }),
    listByAccount: vi.fn(async () => positionStore),
  };
  const portfoliosRepo = {
    append: vi.fn(async (entity: unknown) => entity),
    latestByAccount: vi.fn(async () => null),
  };
  const marketsService = {
    getTicker: vi.fn(async () => ({
      symbol: 'BTCUSDT',
      lastPrice: '100',
      timestamp: 1,
    })),
  };
  const service = new PaperTradingService(
    accountsRepo as never,
    ordersRepo as never,
    positionsRepo as never,
    portfoliosRepo as never,
    marketsService as never,
  );
  return {
    service,
    accountsRepo,
    ordersRepo,
    positionsRepo,
    portfoliosRepo,
    marketsService,
  };
}

const buyDto: PlacePaperOrderDto = {
  symbol: 'BTCUSDT',
  side: 'buy',
  type: 'market',
  quantity: '1',
  stopLoss: '95',
};

describe('PaperTradingService', () => {
  it('creates an ACTIVE account funded with starting cash', async () => {
    const { service, accountsRepo } = createService();
    const created = await service.createAccount('user-1', {
      name: 'Primary',
      startingCash: '5000',
    });
    expect(created.userId).toBe('user-1');
    expect(created.status).toBe('ACTIVE');
    expect(created.freeCash).toBe('5000');
    expect(created.realizedPnl).toBe('0');
    expect(accountsRepo.save).toHaveBeenCalledTimes(1);
  });

  it("lists only the current user's accounts", async () => {
    const { service, accountsRepo } = createService();
    await service.listAccounts('user-1');
    expect(accountsRepo.listByUserId).toHaveBeenCalledWith('user-1');
  });

  describe('placeOrder', () => {
    it('risk-gates and persists a filled market buy', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      const saved = await ctx.service.placeOrder('user-1', 'acc-1', buyDto);

      expect(saved.status).toBe('FILLED');
      expect(saved.filledQuantity).toBe('1');
      expect(saved.avgFillPrice).toBe('100');
      expect(saved.fees).toBe('0.1');

      const savedAccount = ctx.accountsRepo.save.mock
        .calls[0][0] as PaperAccountEntity;
      expect(savedAccount.freeCash).toBe('9899.9');

      const savedPosition = ctx.positionsRepo.save.mock
        .calls[0][0] as PaperPositionEntity;
      expect(savedPosition.quantity).toBe('1');
      expect(savedPosition.avgEntryPrice).toBe('100');
      expect(savedPosition.fees).toBe('0.1');

      const snapshot = ctx.portfoliosRepo.append.mock.calls[0][0] as {
        equity: string;
        cash: string;
        positionValue: string;
      };
      expect(snapshot.cash).toBe('9899.9');
      expect(snapshot.positionValue).toBe('100');
      expect(snapshot.equity).toBe('9999.9');
    });

    it('rejects an oversized order via the risk engine', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      await expect(
        ctx.service.placeOrder('user-1', 'acc-1', {
          ...buyDto,
          quantity: '30',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.ordersRepo.save).not.toHaveBeenCalled();
    });

    it('applies a custom risk config when provided', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      await expect(
        ctx.service.placeOrder('user-1', 'acc-1', buyDto, {
          maxPositionSize: '0.0001',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(ctx.ordersRepo.save).not.toHaveBeenCalled();
    });

    it('falls back to the default risk config when none is provided', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      const saved = await ctx.service.placeOrder('user-1', 'acc-1', buyDto);
      expect(saved.status).toBe('FILLED');
    });

    it('closes a reduce-only sell and records realized P&L', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(
        account({ freeCash: '9899.9' }),
      );
      ctx.positionsRepo.listByAccount.mockResolvedValue([position()] as never);
      const saved = await ctx.service.placeOrder('user-1', 'acc-1', {
        symbol: 'BTCUSDT',
        side: 'sell',
        type: 'market',
        quantity: '0.5',
        reduceOnly: true,
      });

      expect(saved.status).toBe('FILLED');
      expect(saved.fees).toBe('0.05');

      const savedAccount = ctx.accountsRepo.save.mock
        .calls[0][0] as PaperAccountEntity;
      expect(savedAccount.freeCash).toBe('9949.85');
      expect(savedAccount.realizedPnl).toBe('-0.05');

      const savedPosition = ctx.positionsRepo.save.mock
        .calls[0][0] as PaperPositionEntity;
      expect(savedPosition.quantity).toBe('0.5');
      expect(savedPosition.realizedPnl).toBe('-0.05');
    });

    it('rejects a reduce-only order exceeding the held quantity', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(
        account({ freeCash: '9899.9' }),
      );
      ctx.positionsRepo.listByAccount.mockResolvedValue([position()] as never);
      await expect(
        ctx.service.placeOrder('user-1', 'acc-1', {
          symbol: 'BTCUSDT',
          side: 'sell',
          type: 'market',
          quantity: '2',
          reduceOnly: true,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('is idempotent for a repeated clientOrderId', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      const existing = {
        id: 'order-1',
        accountId: 'acc-1',
      } as PaperOrderEntity;
      ctx.ordersRepo.findByAccountAndClientOrderId.mockResolvedValue(
        existing as never,
      );
      const result = await ctx.service.placeOrder('user-1', 'acc-1', {
        ...buyDto,
        clientOrderId: 'repeat-key',
      });
      expect(result).toBe(existing);
      expect(ctx.marketsService.getTicker).not.toHaveBeenCalled();
    });

    it('404s when the account belongs to another user', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(null as never);
      await expect(
        ctx.service.placeOrder('user-2', 'acc-1', buyDto),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('fails when no market price is available', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      ctx.marketsService.getTicker.mockResolvedValue(null as never);
      await expect(
        ctx.service.placeOrder('user-1', 'acc-1', buyDto),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('getPositions', () => {
    it('enriches a position with mark price and unrealized P&L', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      ctx.positionsRepo.listByAccount.mockResolvedValue([position()] as never);
      ctx.marketsService.getTicker.mockResolvedValue({
        symbol: 'BTCUSDT',
        lastPrice: '110',
        timestamp: 1,
      });
      const positions = await ctx.service.getPositions('user-1', 'acc-1');
      expect(positions[0].markPrice).toBe('110');
      expect(positions[0].positionValue).toBe('110');
      expect(positions[0].unrealizedPnl).toBe('10');
    });
  });

  describe('getPortfolio', () => {
    it('returns the latest snapshot when present', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      ctx.portfoliosRepo.latestByAccount.mockResolvedValue({
        id: 'snap-1',
        accountId: 'acc-1',
        equity: '9999.9',
        cash: '9899.9',
        positionValue: '100',
        realizedPnl: '0',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      } as never);
      const portfolio = await ctx.service.getPortfolio('user-1', 'acc-1');
      expect(portfolio).toMatchObject({
        equity: '9999.9',
        cash: '9899.9',
        positionValue: '100',
        realizedPnl: '0',
      });
    });

    it('returns a flat portfolio before any snapshot', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      const portfolio = await ctx.service.getPortfolio('user-1', 'acc-1');
      expect(portfolio).toMatchObject({
        equity: '10000',
        cash: '10000',
        positionValue: '0',
        updatedAt: null,
      });
    });
  });

  describe('settleLimitOrders', () => {
    it('fills a marketable resting buy at its limit price', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      ctx.ordersRepo.listByAccount.mockResolvedValue([
        restingOrder({ id: 'o1', brokerOrderId: 'b1', price: '99' }),
      ] as never);
      ctx.marketsService.getTicker.mockResolvedValue({
        symbol: 'BTCUSDT',
        lastPrice: '98.5',
        timestamp: 1,
      });

      const filled = await ctx.service.settleLimitOrders('user-1', 'acc-1');
      expect(filled).toHaveLength(1);

      const savedOrder = ctx.ordersRepo.save.mock
        .calls[0][0] as PaperOrderEntity;
      expect(savedOrder.status).toBe('FILLED');
      expect(savedOrder.avgFillPrice).toBe('99');
      expect(savedOrder.filledQuantity).toBe('1');
      expect(savedOrder.fees).toBe('0.099');

      const savedAccount = ctx.accountsRepo.save.mock
        .calls[0][0] as PaperAccountEntity;
      expect(savedAccount.freeCash).toBe('9900.901');

      const savedPosition = ctx.positionsRepo.save.mock
        .calls[0][0] as PaperPositionEntity;
      expect(savedPosition.quantity).toBe('1');
      expect(savedPosition.avgEntryPrice).toBe('99');
    });

    it('fills a marketable resting sell against the held position', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      ctx.positionsRepo.listByAccount.mockResolvedValue([position()] as never);
      ctx.ordersRepo.listByAccount.mockResolvedValue([
        restingOrder({
          id: 'o2',
          side: 'sell',
          price: '102',
          reduceOnly: true,
        }),
      ] as never);
      ctx.marketsService.getTicker.mockResolvedValue({
        symbol: 'BTCUSDT',
        lastPrice: '103',
        timestamp: 1,
      });

      const filled = await ctx.service.settleLimitOrders('user-1', 'acc-1');
      expect(filled).toHaveLength(1);

      const savedAccount = ctx.accountsRepo.save.mock
        .calls[0][0] as PaperAccountEntity;
      expect(savedAccount.realizedPnl).toBe('1.898');
      expect(savedAccount.freeCash).toBe('10101.898');
      expect(ctx.positionsRepo.deleteByAccountAndSymbol).toHaveBeenCalledWith(
        'acc-1',
        'BTCUSDT',
      );
    });

    it('rejects a resting sell with no held position instead of going short', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      ctx.positionsRepo.listByAccount.mockResolvedValue([]);
      ctx.ordersRepo.listByAccount.mockResolvedValue([
        restingOrder({ id: 'o3', side: 'sell', price: '102' }),
      ] as never);
      ctx.marketsService.getTicker.mockResolvedValue({
        symbol: 'BTCUSDT',
        lastPrice: '103',
        timestamp: 1,
      });

      await ctx.service.settleLimitOrders('user-1', 'acc-1');
      const savedOrder = ctx.ordersRepo.save.mock
        .calls[0][0] as PaperOrderEntity;
      expect(savedOrder.status).toBe('REJECTED');
      expect(savedOrder.reason).toBe('No held position at settlement');
      expect(ctx.accountsRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a resting buy that would drive cash negative', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(
        account({ freeCash: '50' }),
      );
      ctx.ordersRepo.listByAccount.mockResolvedValue([
        restingOrder({ id: 'o4', price: '500' }),
      ] as never);
      ctx.marketsService.getTicker.mockResolvedValue({
        symbol: 'BTCUSDT',
        lastPrice: '499',
        timestamp: 1,
      });

      await ctx.service.settleLimitOrders('user-1', 'acc-1');
      const savedOrder = ctx.ordersRepo.save.mock
        .calls[0][0] as PaperOrderEntity;
      expect(savedOrder.status).toBe('REJECTED');
      expect(savedOrder.reason).toBe('Insufficient cash at settlement');
      expect(ctx.accountsRepo.save).not.toHaveBeenCalled();
    });

    it('leaves non-marketable resting orders untouched', async () => {
      const ctx = createService();
      ctx.accountsRepo.findByUserIdAndId.mockResolvedValue(account());
      ctx.ordersRepo.listByAccount.mockResolvedValue([
        restingOrder({ id: 'o5', price: '99' }),
      ] as never);
      ctx.marketsService.getTicker.mockResolvedValue({
        symbol: 'BTCUSDT',
        lastPrice: '120',
        timestamp: 1,
      });

      const filled = await ctx.service.settleLimitOrders('user-1', 'acc-1');
      expect(filled).toHaveLength(0);
      expect(ctx.ordersRepo.save).not.toHaveBeenCalled();
      expect(ctx.accountsRepo.save).not.toHaveBeenCalled();
    });
  });
});
