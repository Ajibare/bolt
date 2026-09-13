import { rsi } from "@trading-bolt/indicators";
import type { Candle, Signal } from "@trading-bolt/shared";
import { z } from "zod";
import { buildSignal, holdSignal } from "../signal.js";
import type { Strategy, StrategyFactory } from "../strategy.js";

export const RSI_MEAN_REVERSION_ID = "rsi-mean-reversion";

export const rsiMeanReversionConfigSchema = z
  .object({
    kind: z.literal(RSI_MEAN_REVERSION_ID),
    period: z.number().int().positive(),
    oversold: z.number(),
    overbought: z.number(),
  })
  .refine((config) => config.oversold < 50 && config.overbought > 50, {
    message: "oversold must be below 50 and overbought must be above 50",
    path: ["oversold"],
  })
  .refine((config) => config.oversold < config.overbought, {
    message: "oversold must be below overbought",
    path: ["oversold"],
  });

export type RsiMeanReversionConfig = z.infer<typeof rsiMeanReversionConfigSchema>;

/**
 * Mean-reversion: BUY when RSI is at/below the oversold threshold, SELL when at
 * or above overbought, HOLD otherwise. A flat market yields RSI 100 (see the
 * indicator boundary rules) and therefore signals overbought — deterministic
 * but documented.
 */
export const rsiMeanReversionFactory: StrategyFactory<typeof rsiMeanReversionConfigSchema> = {
  id: RSI_MEAN_REVERSION_ID,
  name: "RSI Mean Reversion",
  description: "Buys oversold markets and sells overbought markets on Wilder RSI.",
  configSchema: rsiMeanReversionConfigSchema,
  create(config) {
    return new RsiMeanReversionStrategy(config);
  },
};

class RsiMeanReversionStrategy implements Strategy {
  readonly id = RSI_MEAN_REVERSION_ID;

  constructor(private readonly config: RsiMeanReversionConfig) {}

  evaluate(candles: ReadonlyArray<Candle>): Signal {
    const { period, oversold, overbought } = this.config;
    if (candles.length < period + 1) {
      return holdSignal(candles, this.id, `insufficient data: need at least ${period + 1} candles`);
    }

    const closes = candles.map((candle) => candle.close);
    const series = rsi(closes, period);
    const latest = series[series.length - 1];
    if (latest === null) {
      return holdSignal(candles, this.id, "insufficient data: RSI not defined");
    }

    const value = latest.toFixed(2);
    if (latest.lte(oversold)) {
      return buildSignal(
        candles,
        this.id,
        "buy",
        `RSI ${value} at or below oversold threshold ${oversold}`,
      );
    }
    if (latest.gte(overbought)) {
      return buildSignal(
        candles,
        this.id,
        "sell",
        `RSI ${value} at or above overbought threshold ${overbought}`,
      );
    }
    return holdSignal(candles, this.id, `RSI ${value} between ${oversold} and ${overbought}`);
  }
}
