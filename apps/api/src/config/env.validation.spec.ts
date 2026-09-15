import { describe, expect, it } from 'vitest';
import { envSchema } from './env.validation.js';

function validEnv(overrides: Record<string, unknown> = {}) {
  return {
    NODE_ENV: 'development',
    DATABASE_URL: 'postgres://bolt:bolt_dev_password@localhost:5432/bolt',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'a'.repeat(40),
    ...overrides,
  };
}

describe('envSchema — Bybit credentials', () => {
  it('accepts a missing credential pair (paper-only deployment)', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BYBIT_ENVIRONMENT).toBe('demo');
    }
  });

  it('accepts a complete credential pair', () => {
    const result = envSchema.safeParse(
      validEnv({
        BYBIT_API_KEY: 'key',
        BYBIT_API_SECRET: 'secret',
        BYBIT_ENVIRONMENT: 'testnet',
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BYBIT_ENVIRONMENT).toBe('testnet');
    }
  });

  it('refuses a key without a secret (fail-closed)', () => {
    const result = envSchema.safeParse(validEnv({ BYBIT_API_KEY: 'key' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('set together');
    }
  });

  it('refuses a secret without a key (fail-closed)', () => {
    const result = envSchema.safeParse(
      validEnv({ BYBIT_API_SECRET: 'secret' }),
    );
    expect(result.success).toBe(false);
  });

  it('treats blank credential values as absent', () => {
    const result = envSchema.safeParse(
      validEnv({
        BYBIT_API_KEY: '   ',
        BYBIT_API_SECRET: '',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an unknown BYBIT_ENVIRONMENT', () => {
    const result = envSchema.safeParse(
      validEnv({ BYBIT_ENVIRONMENT: 'production' }),
    );
    expect(result.success).toBe(false);
  });

  it('defaults BYBIT_ENVIRONMENT to demo', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BYBIT_ENVIRONMENT).toBe('demo');
    }
  });
});
