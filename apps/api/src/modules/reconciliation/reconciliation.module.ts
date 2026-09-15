import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ORDER_RECONCILIATION_QUEUE } from '@trading-bolt/shared';
import { BrokersModule } from '../brokers/brokers.module.js';
import { PaperTradingModule } from '../paper-trading/paper-trading.module.js';
import { PositionReconciliationService } from './position-reconciliation.service.js';
import { ReconciliationProcessor } from './reconciliation.processor.js';
import { ReconciliationProducer } from './reconciliation.producer.js';
import { ReconciliationScheduler } from './reconciliation.scheduler.js';
import { OrderReconciliationService } from './reconciliation.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: ORDER_RECONCILIATION_QUEUE }),
    PaperTradingModule,
    BrokersModule,
  ],
  providers: [
    OrderReconciliationService,
    PositionReconciliationService,
    ReconciliationProcessor,
    ReconciliationProducer,
    ReconciliationScheduler,
  ],
  exports: [OrderReconciliationService, ReconciliationProducer],
})
export class ReconciliationModule {}
