import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.validation.js';

const required = {
  DATABASE_URL: 'postgres://localhost:5432/trading_bolt',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a'.repeat(40),
};

describe('validateEnv', () => {
  it('accepts a valid configuration', () => {
    const config = validateEnv(required);
    expect(config.DATABASE_URL).toBe(required.DATABASE_URL);
    expect(config.REDIS_URL).toBe(required.REDIS_URL);
    expect(config.JWT_SECRET).toBe(required.JWT_SECRET);
  });

  it('applies default values', () => {
    const config = validateEnv(required);
    expect(config.NODE_ENV).toBe('development');
    expect(config.API_PORT).toBe(4000);
    expect(config.LOG_LEVEL).toBe('info');
    expect(config.WEB_ORIGIN).toBe('http://localhost:3000');
    expect(config.JWT_EXPIRES_IN).toBe('15m');
    expect(config.REFRESH_TOKEN_EXPIRES_IN).toBe('7d');
  });

  it('throws when DATABASE_URL is missing', () => {
    expect(() =>
      validateEnv({
        REDIS_URL: required.REDIS_URL,
        JWT_SECRET: required.JWT_SECRET,
      }),
    ).toThrow('DATABASE_URL is required');
  });

  it('throws when REDIS_URL is missing', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: required.DATABASE_URL,
        JWT_SECRET: required.JWT_SECRET,
      }),
    ).toThrow('REDIS_URL is required');
  });

  it('throws when JWT_SECRET is missing', () => {
    expect(() =>
      validateEnv({
        DATABASE_URL: required.DATABASE_URL,
        REDIS_URL: required.REDIS_URL,
      }),
    ).toThrow('JWT_SECRET is required');
  });

  it('throws when JWT_SECRET is shorter than 32 characters', () => {
    expect(() => validateEnv({ ...required, JWT_SECRET: 'too-short' })).toThrow(
      'JWT_SECRET must be at least 32 characters',
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

  it('accepts an optional MARKET_DATA_BASE_URL', () => {
    const config = validateEnv({
      ...required,
      MARKET_DATA_BASE_URL: 'https://api.bybit.com',
    });
    expect(config.MARKET_DATA_BASE_URL).toBe('https://api.bybit.com');
  });

  it('rejects a malformed MARKET_DATA_BASE_URL', () => {
    expect(() =>
      validateEnv({ ...required, MARKET_DATA_BASE_URL: 'not-a-url' }),
    ).toThrow('MARKET_DATA_BASE_URL must be a valid URL');
  });
});
