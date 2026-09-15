import { describe, expect, it } from 'vitest';
import { BybitAdapter } from '@trading-bolt/broker-adapters';
import { BrokersService } from './brokers.service.js';

function makeService(values: Record<string, string> = {}) {
  const config = {
    get: (key: string, fallback?: string) => values[key] ?? fallback,
    getOrThrow: (key: string) => {
      const value = values[key];
      if (value === undefined) {
        throw new Error(`Missing config ${key}`);
      }
      return value;
    },
  };
  return new BrokersService(config as never);
}

describe('BrokersService', () => {
  it('always exposes the paper executor', () => {
    const service = makeService();
    expect(service.listExecutors().find((b) => b.provider === 'paper')).toEqual(
      {
        provider: 'paper',
        mode: 'PAPER',
        environment: 'paper',
        available: true,
      },
    );
  });

  it('reports Bybit as unavailable without credentials', () => {
    const service = makeService();
    expect(service.isLiveConfigured()).toBe(false);
    expect(service.getBybitAdapter()).toBeNull();
    expect(service.listExecutors().find((b) => b.provider === 'bybit')).toEqual(
      {
        provider: 'bybit',
        mode: 'LIVE',
        environment: 'demo',
        available: false,
      },
    );
  });

  it('reports Bybit as available with a full credential pair', () => {
    const service = makeService({
      BYBIT_API_KEY: 'key',
      BYBIT_API_SECRET: 'secret',
    });
    expect(service.isLiveConfigured()).toBe(true);
    expect(service.getBybitAdapter()).toBeInstanceOf(BybitAdapter);
    expect(service.listExecutors().find((b) => b.provider === 'bybit')).toEqual(
      {
        provider: 'bybit',
        mode: 'LIVE',
        environment: 'demo',
        available: true,
      },
    );
  });

  it('honors BYBIT_ENVIRONMENT and caches the adapter instance', () => {
    const service = makeService({
      BYBIT_API_KEY: 'key',
      BYBIT_API_SECRET: 'secret',
      BYBIT_ENVIRONMENT: 'testnet',
    });
    const executor = service
      .listExecutors()
      .find((b) => b.provider === 'bybit');
    expect(executor?.environment).toBe('testnet');
    const first = service.getBybitAdapter();
    expect(service.getBybitAdapter()).toBe(first);
  });

  it('treats blank credentials as not configured', () => {
    const service = makeService({ BYBIT_API_KEY: '', BYBIT_API_SECRET: '  ' });
    expect(service.isLiveConfigured()).toBe(false);
    expect(service.getBybitAdapter()).toBeNull();
  });

  it('never includes secrets in the executor list', () => {
    const service = makeService({
      BYBIT_API_KEY: 'super-secret-key',
      BYBIT_API_SECRET: 'super-secret-value',
    });
    const body = JSON.stringify(service.listExecutors());
    expect(body).not.toContain('super-secret-key');
    expect(body).not.toContain('super-secret-value');
  });
});
