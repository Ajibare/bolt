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

describe('envSchema — Binance credentials', () => {
  it('accepts a missing credential pair (paper-only deployment)', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BINANCE_ENV).toBe('testnet');
    }
  });

  it('accepts a complete Binance testnet credential pair', () => {
    const result = envSchema.safeParse(
      validEnv({
        BINANCE_API_KEY: 'key',
        BINANCE_API_SECRET: 'secret',
        BINANCE_ENV: 'testnet',
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BINANCE_ENV).toBe('testnet');
    }
  });

  it('refuses a Binance key without a secret (fail-closed)', () => {
    const result = envSchema.safeParse(validEnv({ BINANCE_API_KEY: 'key' }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(JSON.stringify(result.error.issues)).toContain('set together');
    }
  });

  it('refuses a Binance secret without a key (fail-closed)', () => {
    const result = envSchema.safeParse(
      validEnv({ BINANCE_API_SECRET: 'secret' }),
    );
    expect(result.success).toBe(false);
  });

  it('treats blank Binance credential values as absent', () => {
    const result = envSchema.safeParse(
      validEnv({
        BINANCE_API_KEY: '   ',
        BINANCE_API_SECRET: '',
      }),
    );
    expect(result.success).toBe(true);
  });

  it('rejects an unknown BINANCE_ENV', () => {
    const result = envSchema.safeParse(validEnv({ BINANCE_ENV: 'demo' }));
    expect(result.success).toBe(false);
  });

  it('defaults BINANCE_ENV to testnet', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BINANCE_ENV).toBe('testnet');
    }
  });

  it('refuses mainnet outside production (fail-closed)', () => {
    const dev = envSchema.safeParse(
      validEnv({
        NODE_ENV: 'development',
        BINANCE_ENV: 'mainnet',
      }),
    );
    expect(dev.success).toBe(false);
    if (!dev.success) {
      expect(JSON.stringify(dev.error.issues)).toContain('refused');
    }
  });

  it('allows mainnet only when NODE_ENV is production', () => {
    const result = envSchema.safeParse(
      validEnv({
        NODE_ENV: 'production',
        BINANCE_ENV: 'mainnet',
        BINANCE_API_KEY: 'key',
        BINANCE_API_SECRET: 'secret',
      }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.BINANCE_ENV).toBe('mainnet');
    }
  });
});

describe('envSchema — DATABASE_URL locality', () => {
  it('accepts a local DATABASE_URL in development', () => {
    const result = envSchema.safeParse(validEnv());
    expect(result.success).toBe(true);
  });

  it('accepts the docker-compose "postgres" host in development', () => {
    const result = envSchema.safeParse(
      validEnv({ DATABASE_URL: 'postgres://bolt:bolt@postgres:5432/bolt' }),
    );
    expect(result.success).toBe(true);
  });

  it('accepts an IPv6 loopback DATABASE_URL in development', () => {
    const result = envSchema.safeParse(
      validEnv({ DATABASE_URL: 'postgres://bolt:bolt@[::1]:5432/bolt' }),
    );
    expect(result.success).toBe(true);
  });

  it('refuses a remote host outside production (fail-closed)', () => {
    const dev = envSchema.safeParse(
      validEnv({
        DATABASE_URL:
          'postgres://bolt:bolt@ep-something.aws-us-east-2.aws.neon.tech/bolt',
      }),
    );
    expect(dev.success).toBe(false);
    if (!dev.success) {
      const issues = JSON.stringify(dev.error.issues);
      expect(issues).toContain('refused');
      expect(issues).toContain('DATABASE_URL');
    }
  });

  it('refuses an unparseable DATABASE_URL outside production', () => {
    const result = envSchema.safeParse(validEnv({ DATABASE_URL: 'not-a-url' }));
    expect(result.success).toBe(false);
  });

  it('allows a remote DATABASE_URL when NODE_ENV is production', () => {
    const result = envSchema.safeParse(
      validEnv({
        NODE_ENV: 'production',
        DATABASE_URL:
          'postgres://bolt:bolt@ep-something.aws-us-east-2.aws.neon.tech/bolt',
      }),
    );
    expect(result.success).toBe(true);
  });
});
