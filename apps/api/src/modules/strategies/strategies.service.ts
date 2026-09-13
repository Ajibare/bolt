import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Signal } from '@trading-bolt/shared';
import {
  createStrategy,
  InvalidStrategyConfigError,
  listStrategies,
  StrategyNotFoundError,
} from '@trading-bolt/trading-engine';
import { MarketsService } from '../markets/markets.service.js';
import { EvaluateStrategyDto } from './dto/evaluate-strategy.dto.js';

export interface StrategySummary {
  id: string;
  name: string;
  description: string;
}

export interface EvaluateStrategyResult {
  candleCount: number;
  signal: Signal;
}

/**
 * Read-only gateway to the strategy registry. Strategies are evaluated against
 * market-data candles; signals are opinions only — no orders are created here.
 */
@Injectable()
export class StrategiesService {
  constructor(private readonly marketsService: MarketsService) {}

  listStrategies(): StrategySummary[] {
    return listStrategies().map((factory) => ({
      id: factory.id,
      name: factory.name,
      description: factory.description,
    }));
  }

  async evaluate(dto: EvaluateStrategyDto): Promise<EvaluateStrategyResult> {
    const candles = await this.marketsService.getCandles(
      dto.symbol,
      dto.interval,
      dto.limit,
    );

    let strategy;
    try {
      strategy = createStrategy(dto.strategyId, dto.config);
    } catch (error) {
      if (error instanceof StrategyNotFoundError) {
        throw new NotFoundException(error.message);
      }
      if (error instanceof InvalidStrategyConfigError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const signal = strategy.evaluate(candles);
    return { candleCount: candles.length, signal };
  }
}
