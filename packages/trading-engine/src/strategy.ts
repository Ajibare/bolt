import type { z } from "zod";
import type { Candle, Signal } from "@trading-bolt/shared";

/**
 * A strategy is a pure function of candles that produces a deterministic Signal
 * — a market opinion only. It never places orders (AGENTS.md §9).
 */
export interface Strategy {
  readonly id: string;
  evaluate(candles: ReadonlyArray<Candle>): Signal;
}

/**
 * Factory that defines a strategy's identity, validates its config, and
 * creates Strategy instances. Strategies are identified by a unique `id` that
 * is used by the strategy registry.
 */
export interface StrategyFactory<TSchema extends z.ZodType = z.ZodType> {
  id: string;
  name: string;
  description: string;
  configSchema: TSchema;
  create(config: z.infer<TSchema>): Strategy;
}
