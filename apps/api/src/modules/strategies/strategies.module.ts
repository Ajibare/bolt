import { Module } from '@nestjs/common';
import { MarketsModule } from '../markets/markets.module.js';
import { StrategiesController } from './strategies.controller.js';
import { StrategiesService } from './strategies.service.js';

@Module({
  imports: [MarketsModule],
  controllers: [StrategiesController],
  providers: [StrategiesService],
  exports: [StrategiesService],
})
export class StrategiesModule {}
