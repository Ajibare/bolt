import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { CANDLE_INTERVALS, SUPPORTED_SYMBOLS } from '@trading-bolt/shared';
import { MARKET_DATA_MAX_LIMIT } from '../../markets/limits.js';

/**
 * Read-only strategy evaluation request. The `config` shape is validated by
 * the strategy's own zod schema inside StrategiesService; here we only ensure
 * it is a plain object. No execution is ever performed.
 */
export class EvaluateStrategyDto {
  @IsString()
  @IsNotEmpty()
  strategyId: string;

  @IsIn([...SUPPORTED_SYMBOLS])
  symbol: string;

  @IsIn([...CANDLE_INTERVALS])
  interval: string;

  @IsObject()
  config: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MARKET_DATA_MAX_LIMIT)
  limit?: number;
}
