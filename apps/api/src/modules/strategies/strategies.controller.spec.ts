import { describe, expect, it, vi } from 'vitest';
import { StrategiesController } from './strategies.controller.js';

function createController() {
  const service = {
    listStrategies: vi.fn().mockReturnValue([]),
    evaluate: vi.fn().mockResolvedValue({ candleCount: 0, signal: {} }),
  };
  return { controller: new StrategiesController(service as never), service };
}

describe('StrategiesController', () => {
  it('delegates listing to the service', () => {
    const { controller, service } = createController();
    controller.listStrategies();
    expect(service.listStrategies).toHaveBeenCalledTimes(1);
  });

  it('delegates evaluation to the service', async () => {
    const { controller, service } = createController();
    const dto = { strategyId: 'sma-crossover', config: {} };
    await controller.evaluate(dto as never);
    expect(service.evaluate).toHaveBeenCalledWith(dto);
  });
});
