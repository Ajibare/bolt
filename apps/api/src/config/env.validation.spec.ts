import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const required = {
  DATABASE_URL: 'postgres://localhost:5432/trading_bolt',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('accepts a valid configuration', () => {
    const config = validateEnv(required);
    expect(config.DATABASE_URL).toBe(required.DATABASE_URL);
    expect(config.REDIS_URL).toBe(required.REDIS_URL);
  });

  it('applies default values', () => {
    const config = validateEnv(required);
    expect(config.NODE_ENV).toBe('development');
    expect(config.API_PORT).toBe(4000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.WEB_ORIGIN).toBe('http://localhost:3000');
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() => validateEnv({ REDIS_URL: required.REDIS_URL })).toThrow(
      'DATABASE_URL is required',
    );
  });

  it('throws when REDIS_URL is missing', () => {
    expect(() => validateEnv({ DATABASE_URL: required.DATABASE_URL })).toThrow(
      'REDIS_URL is required',
    );
  });

  it('coerces numeric strings', () => {
    const config = validateEnv({
      ...required,
      API_PORT: '8080',
      DB_POOL_MAX: '25',
    });
    expect(config.API_PORT).toBe(8080);
    expect(config.DB_POOL_MAX).toBe(25);
  });
});
