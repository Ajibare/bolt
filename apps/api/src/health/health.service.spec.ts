import { describe, expect, it } from 'vitest';
import { HealthService } from './health.service.js';
import type { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import type { DataSource } from 'typeorm';
import type { RedisClient } from '../redis/redis.module.js';

function createMockConfig(
  overrides: Record<string, string> = {},
): ConfigService {
  const values: Record<string, string> = {
    NODE_ENV: 'test',
    APP_NAME: 'trading-bolt',
    ...overrides,
  };
  return {
    get: (key: string) => values[key],
  } as unknown as ConfigService;
}

function createHealthService(options: {
  dbQuery?: () => Promise<unknown>;
  redisPing?: () => Promise<string>;
  queueCounts?: () => Promise<object>;
}): HealthService {
  const dataSource = {
    query: options.dbQuery ?? (async () => []),
  } as unknown as DataSource;
  const redis = {
    ping: options.redisPing ?? (async () => 'PONG'),
  } as unknown as RedisClient;
  const queue = {
    getJobCounts: options.queueCounts ?? (async () => ({})),
  } as unknown as Queue;
  return new HealthService(dataSource, redis, queue, createMockConfig());
}

describe('HealthService', () => {
  it('liveness reports ok with app component', () => {
    const service = createHealthService({});
    const result = service.liveness();

    expect(result.status).toBe('ok');
    expect(result.app).toBe('trading-bolt');
    expect(result.components).toHaveProperty('app');
    expect(result.timestamp).toBeDefined();
  });

  it('readiness reports ok when all underlying services respond', async () => {
    const service = createHealthService({});
    const result = await service.readiness();

    expect(result.status).toBe('ok');
    expect(result.components.database).toMatchObject({ status: 'ok' });
    expect(result.components.redis).toMatchObject({ status: 'ok' });
    expect(result.components.queue).toBeDefined();
  });

  it('readiness reports down when the database is unreachable', async () => {
    const service = createHealthService({
      dbQuery: async () => {
        throw new Error('connection refused');
      },
    });
    const result = await service.readiness();

    expect(result.status).toBe('down');
    expect(result.components.database).toMatchObject({
      status: 'down',
      detail: 'connection refused',
    });
  });

  it('readiness reports down when redis ping fails', async () => {
    const service = createHealthService({
      redisPing: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    const result = await service.readiness();

    expect(result.status).toBe('down');
    expect(result.components.redis).toMatchObject({ status: 'down' });
  });

  it('readiness reports degraded when a component is degraded', async () => {
    const service = createHealthService({
      redisPing: async () => 'LOADING',
    });
    const result = await service.readiness();

    expect(result.status).toBe('degraded');
    expect(result.components.redis).toMatchObject({ status: 'degraded' });
  });
});
