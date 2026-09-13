import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { CreateAppMeta1700000000000 } from './migrations/1700000000000-CreateAppMeta.js';

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
    migrations: [CreateAppMeta1700000000000],
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
    poolSize: config.DB_POOL_MAX,
  });
}
