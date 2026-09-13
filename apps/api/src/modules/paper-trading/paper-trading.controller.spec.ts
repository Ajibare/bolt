import { describe, expect, it, vi } from 'vitest';
import { Role } from '@trading-bolt/shared';
import { PaperTradingController } from './paper-trading.controller.js';

function createController() {
  const service = {
    listAccounts: vi.fn(),
    createAccount: vi.fn(),
    placeOrder: vi.fn(),
    listOrders: vi.fn(),
    getPositions: vi.fn(),
    getPortfolio: vi.fn(),
  };
  return {
    controller: new PaperTradingController(service as never),
    service,
  };
}

const currentUser = { id: 'user-1', email: 'a@b.c', role: Role.USER };

describe('PaperTradingController', () => {
  it('delegates account listing to the service', async () => {
    const { controller, service } = createController();
    service.listAccounts.mockResolvedValue([]);
    await controller.listAccounts(currentUser);
    expect(service.listAccounts).toHaveBeenCalledWith('user-1');
  });

  it('creates an account for the authenticated user', async () => {
    const { controller, service } = createController();
    const dto = { name: 'Primary', startingCash: '10000' };
    await controller.createAccount(currentUser, dto as never);
    expect(service.createAccount).toHaveBeenCalledWith('user-1', dto);
  });

  it('places an order scoped to the account owner', async () => {
    const { controller, service } = createController();
    const dto = {
      symbol: 'BTCUSDT',
      side: 'buy',
      type: 'market',
      quantity: '1',
    };
    await controller.placeOrder(currentUser, 'acc-1', dto as never);
    expect(service.placeOrder).toHaveBeenCalledWith('user-1', 'acc-1', dto);
  });

  it('delegates order listing with query filters', async () => {
    const { controller, service } = createController();
    await controller.listOrders(currentUser, 'acc-1', 'BTCUSDT', 'FILLED', 10);
    expect(service.listOrders).toHaveBeenCalledWith('user-1', 'acc-1', {
      symbol: 'BTCUSDT',
      status: 'FILLED',
      limit: 10,
    });
  });

  it('delegates positions and portfolio queries', async () => {
    const { controller, service } = createController();
    await controller.getPositions(currentUser, 'acc-1');
    await controller.getPortfolio(currentUser, 'acc-1');
    expect(service.getPositions).toHaveBeenCalledWith('user-1', 'acc-1');
    expect(service.getPortfolio).toHaveBeenCalledWith('user-1', 'acc-1');
  });
});
