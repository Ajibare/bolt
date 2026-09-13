import { IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { DECIMAL_STRING_PATTERN } from '../../backtests/dto/run-backtest.dto.js';

export const DEFAULT_PAPER_STARTING_CASH = '10000';

/**
 * Request to open a paper trading account for the authenticated user.
 * Account names are unique per user.
 */
export class CreatePaperAccountDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name: string;

  @IsString()
  @Matches(DECIMAL_STRING_PATTERN, {
    message: 'startingCash must be a decimal number string',
  })
  startingCash: string = DEFAULT_PAPER_STARTING_CASH;
}
