import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { CANDLE_INTERVALS } from '@trading-bolt/shared';
import { MARKET_DATA_MAX_LIMIT } from '../limits.js';

export class CandlesQueryDto {
  @IsIn([...CANDLE_INTERVALS])
  interval: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(MARKET_DATA_MAX_LIMIT)
  limit?: number;
}
