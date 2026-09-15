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
import { LiveTradingService } from './live-trading.service.js';
import { TypeOrmCircuitBreakerRepository } from './typeorm-circuit-breaker.repository.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CircuitBreakerEntity]),
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
    {
      provide: CircuitBreakerRepository,
      useClass: TypeOrmCircuitBreakerRepository,
    },
  ],
  exports: [CircuitBreakerService, LiveTradingService],
})
export class LiveTradingModule {}
