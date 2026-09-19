import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BrokersModule } from '../brokers/brokers.module.js';
import { MarketsModule } from '../markets/markets.module.js';
import { PaperTradingModule } from '../paper-trading/paper-trading.module.js';
import { ReconciliationModule } from '../reconciliation/reconciliation.module.js';
import { UsersModule } from '../users/users.module.js';
import { CircuitBreakerEntity } from './circuit-breaker.entity.js';
import { CircuitBreakerRepository } from './circuit-breaker.repository.js';
import { CircuitBreakerService } from './circuit-breaker.service.js';
import { LiveAccountController } from './live-account.controller.js';
import { LiveOrdersController } from './live-orders.controller.js';
import { LivePortfolioScheduler } from './live-portfolio.scheduler.js';
import { LivePortfolioService } from './live-portfolio.service.js';
import { LivePortfolioSnapshotEntity } from './live-portfolio-snapshot.entity.js';
import { LivePortfolioRepository } from './live-portfolio.repository.js';
import { LiveTradingService } from './live-trading.service.js';
import { TypeOrmCircuitBreakerRepository } from './typeorm-circuit-breaker.repository.js';
import { TypeOrmLivePortfolioRepository } from './typeorm-live-portfolio.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CircuitBreakerEntity,
      LivePortfolioSnapshotEntity,
    ]),
    BrokersModule,
    PaperTradingModule,
    MarketsModule,
    ReconciliationModule,
    UsersModule,
  ],
  controllers: [LiveAccountController, LiveOrdersController],
  providers: [
    CircuitBreakerService,
    LiveTradingService,
    LivePortfolioService,
    LivePortfolioScheduler,
    {
      provide: CircuitBreakerRepository,
      useClass: TypeOrmCircuitBreakerRepository,
    },
    {
      provide: LivePortfolioRepository,
      useClass: TypeOrmLivePortfolioRepository,
    },
  ],
  exports: [
    CircuitBreakerService,
    LiveTradingService,
    LivePortfolioRepository,
    LivePortfolioService,
  ],
})
export class LiveTradingModule {}
