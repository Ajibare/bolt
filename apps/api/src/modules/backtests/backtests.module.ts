import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketsModule } from '../markets/markets.module.js';
import { UsersModule } from '../users/users.module.js';
import { BacktestRepository } from './backtest.repository.js';
import { BacktestsController } from './backtests.controller.js';
import { BacktestsService } from './backtests.service.js';
import {
  BacktestEntity,
  BacktestEquityPointEntity,
  BacktestTradeEntity,
} from './entities/backtest.entity.js';
import { TypeOrmBacktestRepository } from './typeorm-backtest.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      BacktestEntity,
      BacktestTradeEntity,
      BacktestEquityPointEntity,
    ]),
    MarketsModule,
    UsersModule,
  ],
  controllers: [BacktestsController],
  providers: [
    BacktestsService,
    { provide: BacktestRepository, useClass: TypeOrmBacktestRepository },
  ],
  exports: [BacktestsService],
})
export class BacktestsModule {}
