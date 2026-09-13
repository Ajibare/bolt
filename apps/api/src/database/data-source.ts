import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { CreateUsers1700000000001 } from './migrations/1700000000001-CreateUsers.js';
import { CreateSessions1700000000002 } from './migrations/1700000000002-CreateSessions.js';
import { CreateMarketCandles1700000000003 } from './migrations/1700000000003-CreateMarketCandles.js';
import { CreateBacktests1700000000004 } from './migrations/1700000000004-CreateBacktests.js';

/**
 * DataSource used by CLI-style migration and seed scripts run with tsx.
 * The API itself configures TypeORM through AppModule; this standalone
 * source exists so migrations are reproducible outside the runtime.
 */
export function buildDataSource(
  env: Record<string, unknown> = process.env,
): DataSource {
  const config = validateEnv(env);
  return new DataSource({
    type: 'postgres',
    url: config.DATABASE_URL,
    entities: [],
    migrations: [
      CreateUsers1700000000001,
      CreateSessions1700000000002,
      CreateMarketCandles1700000000003,
      CreateBacktests1700000000004,
    ],
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
    poolSize: config.DB_POOL_MAX,
  });
}
