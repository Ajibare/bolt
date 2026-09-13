import { Environment, LogLevel } from '@trading-bolt/shared';
import { z } from 'zod';

const environmentValues = Object.values(Environment) as [
  Environment,
  ...Environment[],
];
const logLevelValues = Object.values(LogLevel) as [LogLevel, ...LogLevel[]];

export const envSchema = z.object({
  NODE_ENV: z.enum(environmentValues).default(Environment.DEVELOPMENT),
  APP_NAME: z.string().min(1).default('trading-bolt'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(logLevelValues).default(LogLevel.INFO),
  DATABASE_URL: z
    .string({ error: 'DATABASE_URL is required' })
    .min(1, 'DATABASE_URL is required'),
  DB_POOL_MIN: z.coerce.number().int().min(0).default(2),
  DB_POOL_MAX: z.coerce.number().int().min(1).default(10),
  REDIS_URL: z
    .string({ error: 'REDIS_URL is required' })
    .min(1, 'REDIS_URL is required'),
  WEB_ORIGIN: z.string().min(1).default('http://localhost:3000'),
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z
    .string({ error: 'JWT_EXPIRES_IN must be a duration string such as 15m' })
    .default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z
    .string({
      error: 'REFRESH_TOKEN_EXPIRES_IN must be a duration string such as 7d',
    })
    .default('7d'),
  ENCRYPTION_KEY: z.string().optional(),
  MARKET_DATA_BASE_URL: z
    .string({ error: 'MARKET_DATA_BASE_URL must be a URL string' })
    .url({ error: 'MARKET_DATA_BASE_URL must be a valid URL' })
    .optional(),
  BYBIT_API_KEY: z.string().optional(),
  BYBIT_API_SECRET: z.string().optional(),
  BYBIT_ENVIRONMENT: z.string().optional(),
  AI_API_KEY: z.string().optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

/**
 * Fails fast on invalid or missing environment configuration so the API
 * never boots in an undefined or partially configured state.
 */
export function validateEnv(config: Record<string, unknown>): AppEnv {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    const issues = result.error.issues.map(
      (issue) => `- ${issue.path.join('.')}: ${issue.message}`,
    );
    throw new Error(`Invalid environment configuration:\n${issues.join('\n')}`);
  }
  return result.data;
}
