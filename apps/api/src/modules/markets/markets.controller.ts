import {
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import type { SupportedSymbol } from '@trading-bolt/shared';
import type { Candle, Ticker } from '@trading-bolt/shared';
import { MarketsService } from './markets.service.js';
import { CandlesQueryDto } from './dto/candles-query.dto.js';

@Controller('markets')
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get('symbols')
  getSymbols(): SupportedSymbol[] {
    return this.markets.getSymbols();
  }

  @Get(':symbol/candles')
  getCandles(
    @Param('symbol') symbol: string,
    @Query() query: CandlesQueryDto,
  ): Promise<Candle[]> {
    return this.markets.getCandles(symbol, query.interval, query.limit);
  }

  @Get(':symbol/ticker')
  @HttpCode(200)
  async getTicker(@Param('symbol') symbol: string): Promise<Ticker> {
    const ticker = await this.markets.getTicker(symbol);
    if (!ticker) {
      throw new NotFoundException(
        `No ticker available for ${symbol.toUpperCase()}`,
      );
    }
    return ticker;
  }
}
