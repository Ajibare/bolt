import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FetchJsonClient } from './http-client.js';
import {
  BybitMarketDataProvider,
  BYBIT_BASE_URL,
} from './bybit.market-data.provider.js';
import { MarketCandleEntity } from './market-candle.entity.js';
import { MarketCandleRepository } from './market-candle.repository.js';
import { MarketDataProvider } from './market-data.provider.js';
import {
  MARKET_DATA_BASE_URL,
  MARKET_DATA_CLIENT,
} from './markets.constants.js';
import { MarketsController } from './markets.controller.js';
import { MarketsService } from './markets.service.js';
import { TypeOrmMarketCandleRepository } from './typeorm-market-candle.repository.js';

@Module({
  imports: [TypeOrmModule.forFeature([MarketCandleEntity])],
  controllers: [MarketsController],
  providers: [
    MarketsService,
    { provide: MarketDataProvider, useClass: BybitMarketDataProvider },
    {
      provide: MarketCandleRepository,
      useClass: TypeOrmMarketCandleRepository,
    },
    { provide: MARKET_DATA_CLIENT, useClass: FetchJsonClient },
    {
      provide: MARKET_DATA_BASE_URL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get<string>('MARKET_DATA_BASE_URL') ?? BYBIT_BASE_URL,
    },
  ],
  exports: [MarketsService, MarketDataProvider],
})
export class MarketsModule {}
