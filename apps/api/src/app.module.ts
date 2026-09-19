import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { validateEnv } from './config/env.validation.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { MarketsModule } from './modules/markets/markets.module.js';
import { StrategiesModule } from './modules/strategies/strategies.module.js';
import { BacktestsModule } from './modules/backtests/backtests.module.js';
import { PaperTradingModule } from './modules/paper-trading/paper-trading.module.js';
import { BrokersModule } from './modules/brokers/brokers.module.js';
import { ReconciliationModule } from './modules/reconciliation/reconciliation.module.js';
import { LiveTradingModule } from './modules/live-trading/live-trading.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { BotsModule } from './modules/bots/bots.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { RedisModule } from './redis/redis.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: configService.getOrThrow<string>('DATABASE_URL'),
        autoLoadEntities: true,
        synchronize: false,
        logging:
          configService.get<string>('NODE_ENV') === 'development'
            ? ['error', 'warn']
            : ['error'],
        retryAttempts: 3,
        retryDelay: 1000,
        poolSize: configService.get<number>('DB_POOL_MAX') ?? 10,
      }),
    }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: {
          url: configService.getOrThrow<string>('REDIS_URL'),
          maxRetriesPerRequest: null,
        },
      }),
    }),
    RedisModule,
    HealthModule,
    AuthModule,
    MarketsModule,
    StrategiesModule,
    BacktestsModule,
    PaperTradingModule,
    BrokersModule,
    ReconciliationModule,
    LiveTradingModule,
    AnalyticsModule,
    BotsModule,
    NotificationsModule,
  ],
})
export class AppModule {}
