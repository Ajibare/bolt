import { InvalidStrategyConfigError, StrategyNotFoundError } from "./errors.js";
import type { Strategy, StrategyFactory } from "./strategy.js";

const factories = new Map<string, StrategyFactory>();

function registerStrategy(factory: StrategyFactory): void {
  factories.set(factory.id, factory);
}

function isRegisteredStrategy(id: string): boolean {
  return factories.has(id);
}

function listStrategies(): ReadonlyArray<StrategyFactory> {
  return [...factories.values()];
}

function getStrategyFactory(id: string): StrategyFactory | undefined {
  return factories.get(id);
}

/**
 * Validates the raw config against the strategy's zod schema and instantiates
 * it. Unknown ids and invalid configs throw typed errors instead of failing
 * silently.
 */
function createStrategy(id: string, config: unknown): Strategy {
  const factory = factories.get(id);
  if (!factory) {
    throw new StrategyNotFoundError(id);
  }
  const result = factory.configSchema.safeParse(config);
  if (!result.success) {
    throw new InvalidStrategyConfigError(id, result.error);
  }
  return factory.create(result.data);
}

export {
  registerStrategy,
  isRegisteredStrategy,
  listStrategies,
  getStrategyFactory,
  createStrategy,
};
