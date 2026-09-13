import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { BacktestsController } from './backtests.controller.js';
import { RunBacktestDto } from './dto/run-backtest.dto.js';

function createController() {
  const service = {
    run: vi.fn().mockResolvedValue({ id: 'bt-1' }),
    findById: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
  };
  return { controller: new BacktestsController(service as never), service };
}

describe('BacktestsController', () => {
  it('delegates listing to the service', async () => {
    const { controller, service } = createController();
    await controller.list();
    expect(service.list).toHaveBeenCalledTimes(1);
  });

  it('delegates run to the service', async () => {
    const { controller, service } = createController();
    const dto: RunBacktestDto = {
      strategyId: 'sma-crossover',
      symbol: 'BTCUSDT',
      interval: '1h',
      config: {},
    };
    const result = await controller.run(dto);
    expect(service.run).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ id: 'bt-1' });
  });

  it('returns the detail when found', async () => {
    const { controller, service } = createController();
    service.findById.mockResolvedValue({ id: 'bt-1' });
    const result = await controller.detail('bt-1');
    expect(result).toEqual({ id: 'bt-1' });
  });

  it('throws NotFoundException when the id is missing', async () => {
    const { controller } = createController();
    await expect(controller.detail('bt-1')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
