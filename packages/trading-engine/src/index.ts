/**
 * @trading-bolt/trading-engine
 *
 * Strategy definitions and the strategy registry. Strategies produce
 * deterministic Signals from candles and never execute orders (AGENTS.md §9).
 *
 * Importing the package index registers the built-in strategy factories so
 * `listStrategies` / `createStrategy` work out of the box; consumers may also
 * call `registerStrategy` for additional factories.
 */
import { registerStrategy } from "./registry.js";
import { rsiMeanReversionFactory } from "./strategies/rsi-mean-reversion.js";
import { smaCrossoverFactory } from "./strategies/sma-crossover.js";

registerStrategy(smaCrossoverFactory);
registerStrategy(rsiMeanReversionFactory);

export * from "./errors.js";
export * from "./signal.js";
export * from "./strategy.js";
export * from "./registry.js";
export * from "./strategies/sma-crossover.js";
export * from "./strategies/rsi-mean-reversion.js";
export * from "./backtest/backtest.js";
