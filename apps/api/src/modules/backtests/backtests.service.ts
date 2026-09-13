import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Money } from '@trading-bolt/shared';
import {
  BacktestError,
  createStrategy,
  InvalidStrategyConfigError,
  runBacktest,
  StrategyNotFoundError,
  type BacktestResult,
} from '@trading-bolt/trading-engine';
import { MarketsService } from '../markets/markets.service.js';
import { mapResult, PersistBacktestInput } from './backtest.mapper.js';
import { BacktestRepository } from './backtest.repository.js';
import { RunBacktestDto } from './dto/run-backtest.dto.js';
import { BacktestEntity } from './entities/backtest.entity.js';

/**
 * Orchestrates completed backtest runs: candles from MarketsService, engine
 * execution, then persistence. Results are stored reports — no orders.
 */
@Injectable()
export class BacktestsService {
  constructor(
    private readonly backtests: BacktestRepository,
    private readonly marketsService: MarketsService,
  ) {}

  /**
   * Run a backtest from a validated DTO and persist the stored report.
   * Strategy/config/shape errors are surfaced as 400/404 HTTP errors; the
   * engine's decimal-exact execution then writes the immutable result.
   */
  async run(dto: RunBacktestDto): Promise<BacktestEntity> {
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

    let result: BacktestResult;
    try {
      result = runBacktest({
        strategy,
        candles,
        startingBalance: dto.startingBalance as Money,
        feeRate: dto.feeRate as Money,
        slippageRate: dto.slippageRate as Money,
        positionSize: dto.positionSize as Money,
        allowShort: dto.allowShort ?? false,
        riskFreeRate: dto.riskFreeRate as Money,
      });
    } catch (error) {
      if (error instanceof BacktestError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    return this.store({
      strategyId: dto.strategyId,
      config: dto.config,
      symbol: dto.symbol,
      interval: dto.interval,
      candleLimit: candles.length,
      feeRate: dto.feeRate as Money,
      slippageRate: dto.slippageRate as Money,
      positionSize: dto.positionSize as Money,
      allowShort: dto.allowShort ?? false,
      riskFreeRate: dto.riskFreeRate as Money,
      result,
    });
  }

  async store(input: PersistBacktestInput): Promise<BacktestEntity> {
    return this.backtests.save(mapResult(input));
  }

  findById(id: string): Promise<BacktestEntity | null> {
    return this.backtests.findById(id);
  }

  list(limit = 50): Promise<BacktestEntity[]> {
    return this.backtests.list(limit);
  }
}
