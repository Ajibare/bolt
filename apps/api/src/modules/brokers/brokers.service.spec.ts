import { describe, expect, it } from 'vitest';
import { BinanceAdapter, BybitAdapter } from '@trading-bolt/broker-adapters';
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

  it('reports both live providers as unavailable without credentials', () => {
    const service = makeService();
    expect(service.isLiveConfigured()).toBe(false);
    expect(service.provider()).toBeNull();
    expect(service.getLiveAdapter()).toBeNull();
    expect(
      service.listExecutors().find((b) => b.provider === 'binance'),
    ).toEqual({
      provider: 'binance',
      mode: 'LIVE',
      environment: 'testnet',
      available: false,
    });
    expect(service.listExecutors().find((b) => b.provider === 'bybit')).toEqual(
      {
        provider: 'bybit',
        mode: 'LIVE',
        environment: 'demo',
        available: false,
      },
    );
  });

  it('reports the primary target as Binance testnet when unconfigured', () => {
    const service = makeService();
    expect(service.environment()).toBe('testnet');
  });

  it('activates Binance with a full credential pair (primary)', () => {
    const service = makeService({
      BINANCE_API_KEY: 'key',
      BINANCE_API_SECRET: 'secret',
    });
    expect(service.provider()).toBe('binance');
    expect(service.isLiveConfigured()).toBe(true);
    expect(service.getLiveAdapter()).toBeInstanceOf(BinanceAdapter);
    expect(service.environment()).toBe('testnet');
    expect(
      service.listExecutors().find((b) => b.provider === 'binance'),
    ).toEqual({
      provider: 'binance',
      mode: 'LIVE',
      environment: 'testnet',
      available: true,
    });
    expect(service.listExecutors().find((b) => b.provider === 'bybit')).toEqual(
      {
        provider: 'bybit',
        mode: 'LIVE',
        environment: 'demo',
        available: false,
      },
    );
  });

  it('honors BINANCE_ENV and caches the adapter instance', () => {
    const service = makeService({
      BINANCE_API_KEY: 'key',
      BINANCE_API_SECRET: 'secret',
      BINANCE_ENV: 'testnet',
    });
    const executor = service
      .listExecutors()
      .find((b) => b.provider === 'binance');
    expect(executor?.environment).toBe('testnet');
    const first = service.getLiveAdapter();
    expect(service.getLiveAdapter()).toBe(first);
  });

  it('activates Bybit when only Bybit credentials exist (fallback)', () => {
    const service = makeService({
      BYBIT_API_KEY: 'key',
      BYBIT_API_SECRET: 'secret',
      BYBIT_ENVIRONMENT: 'testnet',
    });
    expect(service.provider()).toBe('bybit');
    expect(service.getLiveAdapter()).toBeInstanceOf(BybitAdapter);
    expect(service.listExecutors().find((b) => b.provider === 'bybit')).toEqual(
      {
        provider: 'bybit',
        mode: 'LIVE',
        environment: 'testnet',
        available: true,
      },
    );
    expect(service.environment()).toBe('testnet');
  });

  it('prefers Binance over Bybit when both providers are configured', () => {
    const service = makeService({
      BINANCE_API_KEY: 'binance-key',
      BINANCE_API_SECRET: 'binance-secret',
      BYBIT_API_KEY: 'bybit-key',
      BYBIT_API_SECRET: 'bybit-secret',
    });
    expect(service.provider()).toBe('binance');
    expect(service.getLiveAdapter()).toBeInstanceOf(BinanceAdapter);
  });

  it('treats blank credentials as not configured', () => {
    const service = makeService({
      BINANCE_API_KEY: '',
      BINANCE_API_SECRET: '  ',
    });
    expect(service.isLiveConfigured()).toBe(false);
    expect(service.getLiveAdapter()).toBeNull();
  });

  it('never includes secrets in the executor list', () => {
    const service = makeService({
      BINANCE_API_KEY: 'super-secret-key',
      BINANCE_API_SECRET: 'super-secret-value',
    });
    const body = JSON.stringify(service.listExecutors());
    expect(body).not.toContain('super-secret-key');
    expect(body).not.toContain('super-secret-value');
  });

  it('reports the Bybit environment correctly', () => {
    const service = makeService({
      BYBIT_API_KEY: 'key',
      BYBIT_API_SECRET: 'secret',
      BYBIT_ENVIRONMENT: 'mainnet',
    });
    expect(
      service.listExecutors().find((b) => b.provider === 'bybit')?.environment,
    ).toBe('mainnet');
  });
});
