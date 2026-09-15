import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BOT_EXECUTION_QUEUE } from '@trading-bolt/shared';
import { BrokersModule } from '../brokers/brokers.module.js';
import { LiveTradingModule } from '../live-trading/live-trading.module.js';
import { MarketsModule } from '../markets/markets.module.js';
import { PaperTradingModule } from '../paper-trading/paper-trading.module.js';
import { UsersModule } from '../users/users.module.js';
import {
  BotEntity,
  BotRunCycleEntity,
  BotRunEntity,
} from './entities/bot.entity.js';
import {
  BotRepository,
  BotRunCycleRepository,
  BotRunRepository,
} from './bot.repository.js';
import {
  TypeOrmBotRepository,
  TypeOrmBotRunCycleRepository,
  TypeOrmBotRunRepository,
} from './typeorm-bot.repository.js';
import { BotExecutionProcessor } from './bot-execution.processor.js';
import { BotRunnerService } from './bot-runner.service.js';
import { BotsController } from './bots.controller.js';
import { BotsService } from './bots.service.js';
import { BotScheduler, BullMqBotScheduler } from './bot-scheduler.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([BotEntity, BotRunEntity, BotRunCycleEntity]),
    BullModule.registerQueue({ name: BOT_EXECUTION_QUEUE }),
    MarketsModule,
    PaperTradingModule,
    BrokersModule,
    LiveTradingModule,
    UsersModule,
  ],
  controllers: [BotsController],
  providers: [
    BotsService,
    BotRunnerService,
    {
      provide: BotRepository,
      useClass: TypeOrmBotRepository,
    },
    { provide: BotRunRepository, useClass: TypeOrmBotRunRepository },
    {
      provide: BotRunCycleRepository,
      useClass: TypeOrmBotRunCycleRepository,
    },
    { provide: BotScheduler, useClass: BullMqBotScheduler },
    BotExecutionProcessor,
  ],
  exports: [BotRunnerService],
})
export class BotsModule {}
