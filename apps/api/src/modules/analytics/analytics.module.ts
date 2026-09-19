import { Module } from '@nestjs/common';

import { PaperTradingModule } from '../paper-trading/paper-trading.module.js';
import { BotsModule } from '../bots/bots.module.js';
import { BrokersModule } from '../brokers/brokers.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  imports: [PaperTradingModule, BotsModule, BrokersModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
