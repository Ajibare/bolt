import { crossovers, sma } from "@trading-bolt/indicators";
import type { Candle, Signal } from "@trading-bolt/shared";
import { z } from "zod";
import { buildSignal, holdSignal } from "../signal.js";
import type { Strategy, StrategyFactory } from "../strategy.js";

export const SMA_CROSSOVER_ID = "sma-crossover";

export const smaCrossoverConfigSchema = z
  .object({
    kind: z.literal(SMA_CROSSOVER_ID),
    fastPeriod: z.number().int().positive(),
    slowPeriod: z.number().int().positive(),
  })
  .refine((config) => config.slowPeriod > config.fastPeriod, {
    message: "slowPeriod must be greater than fastPeriod",
    path: ["slowPeriod"],
  });

export type SmaCrossoverConfig = z.infer<typeof smaCrossoverConfigSchema>;

/**
 * Emits BUY on the exact candle where the fast SMA crosses above the slow SMA,
 * SELL on the reverse, and holds otherwise. Events are computed from the
 * entire supplied candle history; no order execution is performed.
 */
export const smaCrossoverFactory: StrategyFactory<typeof smaCrossoverConfigSchema> = {
  id: SMA_CROSSOVER_ID,
  name: "SMA Crossover",
  description: "Buys when a fast SMA crosses above a slow SMA, sells when it crosses back below.",
  configSchema: smaCrossoverConfigSchema,
  create(config) {
    return new SmaCrossoverStrategy(config);
  },
};

class SmaCrossoverStrategy implements Strategy {
  readonly id = SMA_CROSSOVER_ID;

  constructor(private readonly config: SmaCrossoverConfig) {}

  evaluate(candles: ReadonlyArray<Candle>): Signal {
    const { fastPeriod, slowPeriod } = this.config;
    if (candles.length < slowPeriod + 1) {
      return holdSignal(
        candles,
        this.id,
        `insufficient data: need at least ${slowPeriod + 1} candles`,
      );
    }

    const closes = candles.map((candle) => candle.close);
    const fast = sma(closes, fastPeriod);
    const slow = sma(closes, slowPeriod);
    const events = crossovers(fast, slow);
    const latest = events[events.length - 1];

    if (latest === "bullish") {
      return buildSignal(
        candles,
        this.id,
        "buy",
        `fast SMA (${fastPeriod}) crossed above slow SMA (${slowPeriod})`,
      );
    }
    if (latest === "bearish") {
      return buildSignal(
        candles,
        this.id,
        "sell",
        `fast SMA (${fastPeriod}) crossed below slow SMA (${slowPeriod})`,
      );
    }
    return holdSignal(
      candles,
      this.id,
      `no SMA (${fastPeriod}/${slowPeriod}) crossover at the latest bar`,
    );
  }
}
