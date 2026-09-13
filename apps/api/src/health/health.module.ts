import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { SMOKE_QUEUE } from '@trading-bolt/shared';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

@Module({
  imports: [BullModule.registerQueue({ name: SMOKE_QUEUE })],
  controllers: [HealthController],
  providers: [HealthService],
})
export class HealthModule {}
