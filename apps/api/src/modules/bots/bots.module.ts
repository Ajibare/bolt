import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BOT_EXECUTION_QUEUE } from '@trading-bolt/shared';
import { MarketsModule } from '../markets/markets.module.js';
import { PaperTradingModule } from '../paper-trading/paper-trading.module.js';
import { UsersModule } from '../users/users.module.js';
import { BotEntity, BotRunEntity } from './entities/bot.entity.js';
import { BotRepository, BotRunRepository } from './bot.repository.js';
import {
  TypeOrmBotRepository,
  TypeOrmBotRunRepository,
} from './typeorm-bot.repository.js';
import { BotExecutionProcessor } from './bot-execution.processor.js';
import { BotRunnerService } from './bot-runner.service.js';
import { BotsController } from './bots.controller.js';
import { BotsService } from './bots.service.js';
import { BotScheduler, BullMqBotScheduler } from './bot-scheduler.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([BotEntity, BotRunEntity]),
    BullModule.registerQueue({ name: BOT_EXECUTION_QUEUE }),
    MarketsModule,
    PaperTradingModule,
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
    { provide: BotScheduler, useClass: BullMqBotScheduler },
    BotExecutionProcessor,
  ],
  exports: [BotRunnerService],
})
export class BotsModule {}