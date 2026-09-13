import {
  BOT_EXECUTION_MODES,
  CANDLE_INTERVALS,
  SUPPORTED_SYMBOLS,
} from '@trading-bolt/shared';
import {
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { DECIMAL_STRING_PATTERN } from '../../backtests/dto/run-backtest.dto.js';

/**
 * Create a bot draft (status DRAFT). The service layer re-validates the
 * strategy config against its registry schema and the risk policy with the
 * risk engine before anything is persisted (AGENTS.md §18/§23). Only PAPER
 * execution is available in the MVP — DEMO/TESTNET/LIVE need live credentials
 * (AGENTS.md §11-12) and are rejected by the service.
 */
export class CreateBotDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @IsString()
  @MinLength(1)
  @MaxLength(128)
  strategyId: string;

  @IsObject()
  config: Record<string, unknown>;

  @IsIn([...SUPPORTED_SYMBOLS])
  symbol: string;

  @IsIn([...CANDLE_INTERVALS])
  interval: string;

  @IsOptional()
  @IsObject()
  riskConfig?: Record<string, unknown>;

  @IsUUID('4')
  paperAccountId: string;

  @IsIn([...BOT_EXECUTION_MODES])
  executionMode: string;

  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'quantity must be a decimal number string',
  })
  quantity: string;

  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'stopLossPercent must be a decimal number string',
  })
  stopLossPercent: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'takeProfitPercent must be a decimal number string',
  })
  takeProfitPercent?: string;
}