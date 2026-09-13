import {
  IsBoolean,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { SUPPORTED_SYMBOLS } from '@trading-bolt/shared';
import { DECIMAL_STRING_PATTERN } from '../../backtests/dto/run-backtest.dto.js';

/**
 * Request to place a paper order. The risk engine decides approval after
 * validation, never the frontend (AGENTS.md §18/§23). Server-enforced
 * defaults keep paper trading safe and deterministic.
 */
export class PlacePaperOrderDto {
  @IsIn([...SUPPORTED_SYMBOLS])
  symbol: string;

  @IsIn(['buy', 'sell'])
  side: 'buy' | 'sell';

  /** Only order types required by the MVP are exposed (AGENTS roadmap). */
  @IsIn(['market', 'limit'])
  type: 'market' | 'limit';

  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'quantity must be a decimal number string',
  })
  quantity: string;

  /** Required for limit orders; ignored for market orders. */
  @ValidateIf((o: PlacePaperOrderDto) => o.type === 'limit')
  @IsString()
  @IsNotEmpty()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'price must be a decimal number string',
  })
  price?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'stopLoss must be a decimal number string',
  })
  stopLoss?: string;

  @IsOptional()
  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'takeProfit must be a decimal number string',
  })
  takeProfit?: string;

  /** Closes/reduces an existing held position; never blocked by opening rules. */
  @IsOptional()
  @IsBoolean()
  reduceOnly?: boolean = false;

  /** Optional idempotency key; retries with the same key return the same order. */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  clientOrderId?: string;
}
