import {
  APP_NAME,
  type ComponentStatus,
  type HealthComponent,
  type ServiceHealth,
} from '@trading-bolt/shared';
import { Inject, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { DataSource } from 'typeorm';
import { SMOKE_QUEUE } from '@trading-bolt/shared';
import { REDIS_CLIENT } from '../redis/redis.constants.js';
import type { RedisClient } from '../redis/redis.module.js';

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    @Inject(REDIS_CLIENT) private readonly redis: RedisClient,
    @InjectQueue(SMOKE_QUEUE) private readonly smokeQueue: Queue,
    private readonly config: ConfigService,
  ) {}

  liveness(): ServiceHealth {
    return this.build(
      new Map([
        [
          'app',
          {
            status: 'ok',
            detail: this.config.get<string>('APP_NAME') ?? APP_NAME,
          },
        ],
      ]),
    );
  }

  async readiness(): Promise<ServiceHealth> {
    const components = new Map<string, HealthComponent>();
    await this.checkDatabase(components);
    await this.checkRedis(components);
    await this.checkQueue(components);
    return this.build(components);
  }

  private async checkDatabase(
    components: Map<string, HealthComponent>,
  ): Promise<void> {
    try {
      await this.dataSource.query('SELECT 1');
      components.set('database', { status: 'ok' });
    } catch (error) {
      components.set('database', {
        status: 'down',
        detail: (error as Error).message,
      });
    }
  }

  private async checkRedis(
    components: Map<string, HealthComponent>,
  ): Promise<void> {
    try {
      const pong = await this.redis.ping();
      components.set(
        'redis',
        pong === 'PONG'
          ? { status: 'ok' }
          : { status: 'degraded', detail: pong },
      );
    } catch (error) {
      components.set('redis', {
        status: 'down',
        detail: (error as Error).message,
      });
    }
  }

  private async checkQueue(
    components: Map<string, HealthComponent>,
  ): Promise<void> {
    try {
      const counts = await this.smokeQueue.getJobCounts();
      components.set('queue', { status: 'ok', detail: JSON.stringify(counts) });
    } catch (error) {
      components.set('queue', {
        status: 'down',
        detail: (error as Error).message,
      });
    }
  }

  private build(components: Map<string, HealthComponent>): ServiceHealth {
    const entries = Array.from(components.entries());
    const status: ComponentStatus = entries.every(
      ([, component]) => component.status === 'ok',
    )
      ? 'ok'
      : entries.some(([, component]) => component.status === 'down')
        ? 'down'
        : 'degraded';

    return {
      status,
      app: APP_NAME,
      environment: this.config.get<string>('NODE_ENV') ?? 'development',
      version: '0.0.1',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
      components: Object.fromEntries(entries),
    };
  }
}
