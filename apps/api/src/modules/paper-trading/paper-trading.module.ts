import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MarketsModule } from '../markets/markets.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  PaperAccountEntity,
  PaperOrderEntity,
  PaperPortfolioSnapshotEntity,
  PaperPositionEntity,
} from './entities/paper-trading.entity.js';
import {
  PaperAccountRepository,
  PaperOrderRepository,
  PaperPortfolioRepository,
  PaperPositionRepository,
} from './paper-trading.repository.js';
import { PaperTradingController } from './paper-trading.controller.js';
import { PaperTradingService } from './paper-trading.service.js';
import {
  TypeOrmPaperAccountRepository,
  TypeOrmPaperOrderRepository,
  TypeOrmPaperPortfolioRepository,
  TypeOrmPaperPositionRepository,
} from './typeorm-paper-trading.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PaperAccountEntity,
      PaperOrderEntity,
      PaperPositionEntity,
      PaperPortfolioSnapshotEntity,
    ]),
    MarketsModule,
    UsersModule,
  ],
  controllers: [PaperTradingController],
  providers: [
    PaperTradingService,
    {
      provide: PaperAccountRepository,
      useClass: TypeOrmPaperAccountRepository,
    },
    { provide: PaperOrderRepository, useClass: TypeOrmPaperOrderRepository },
    {
      provide: PaperPositionRepository,
      useClass: TypeOrmPaperPositionRepository,
    },
    {
      provide: PaperPortfolioRepository,
      useClass: TypeOrmPaperPortfolioRepository,
    },
  ],
  exports: [PaperTradingService],
})
export class PaperTradingModule {}
