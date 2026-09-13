import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';
import { Redis } from 'ioredis';
import { REDIS_CLIENT } from './redis.constants.js';

export type RedisClient = Redis;

/**
 * Shared Redis client used for health checks and general-purpose state.
 * `lazyConnect` keeps the API bootable even when Redis is temporarily
 * unavailable; connections are established on first use.
 */
@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): RedisClient => {
        const options: RedisOptions = {
          lazyConnect: true,
          maxRetriesPerRequest: null,
        };
        const client = new Redis(
          configService.getOrThrow<string>('REDIS_URL'),
          options,
        );
        client.on('error', (error) => {
          Logger.error(
            `Redis client error: ${error.message}`,
            error.stack,
            'RedisModule',
          );
        });
        return client;
      },
    },
  ],
  exports: [REDIS_CLIENT],
})
export class RedisModule {}

export { REDIS_CLIENT } from './redis.constants.js';
