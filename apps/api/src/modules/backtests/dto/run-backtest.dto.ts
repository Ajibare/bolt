import {
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CANDLE_INTERVALS, SUPPORTED_SYMBOLS } from '@trading-bolt/shared';
import { MARKET_DATA_MAX_LIMIT } from '../../markets/limits.js';

/**
 * A decimal number transport string, e.g. "0.001", "10000", "-5". Actual
 * range semantics (positive balances, (0,1] sizes, non-negative rates) are
 * enforced by the backtest engine and surfaced as 400s.
 */
export const DECIMAL_STRING_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)$/;

export const DEFAULT_STARTING_BALANCE = '10000';
export const DEFAULT_FEE_RATE = '0';
export const DEFAULT_SLIPPAGE_RATE = '0';
export const DEFAULT_POSITION_SIZE = '1';
export const DEFAULT_RISK_FREE_RATE = '0';

/**
 * Request to run and persist a backtest. Bridges the validated strategy
 * evaluation shape (§17 step C) with the engine's execution parameters.
 * No execution path exists — results are stored reports only.
 */
export class RunBacktestDto {
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

  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'startingBalance must be a decimal number string',
  })
  startingBalance?: string = DEFAULT_STARTING_BALANCE;

  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'feeRate must be a decimal number string',
  })
  feeRate?: string = DEFAULT_FEE_RATE;

  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'slippageRate must be a decimal number string',
  })
  slippageRate?: string = DEFAULT_SLIPPAGE_RATE;

  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'positionSize must be a decimal number string',
  })
  positionSize?: string = DEFAULT_POSITION_SIZE;

  @IsOptional()
  @IsBoolean()
  allowShort?: boolean = false;

  @IsOptional()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'riskFreeRate must be a decimal number string',
  })
  riskFreeRate?: string = DEFAULT_RISK_FREE_RATE;
}
