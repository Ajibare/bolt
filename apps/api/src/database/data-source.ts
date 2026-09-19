import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation.js';
import { CreateUsers1700000000001 } from './migrations/1700000000001-CreateUsers.js';
import { CreateSessions1700000000002 } from './migrations/1700000000002-CreateSessions.js';
import { CreateMarketCandles1700000000003 } from './migrations/1700000000003-CreateMarketCandles.js';
import { CreateBacktests1700000000004 } from './migrations/1700000000004-CreateBacktests.js';
import { CreatePaperTrading1700000000005 } from './migrations/1700000000005-CreatePaperTrading.js';
import { CreateBots1700000000006 } from './migrations/1700000000006-CreateBots.js';
import { CreateBotRunCycles1700000000007 } from './migrations/1700000000007-CreateBotRunCycles.js';
import { AddBrokerReconciliation1700000000008 } from './migrations/1700000000008-AddBrokerReconciliation.js';
import { AddCircuitBreakers1700000000009 } from './migrations/1700000000009-AddCircuitBreakers.js';
import { AddBinanceOcoBracket1700000000010 } from './migrations/1700000000010-AddBinanceOcoBracket.js';
import { AddBotOrderAttribution1700000000011 } from './migrations/1700000000011-AddBotOrderAttribution.js';

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
      CreatePaperTrading1700000000005,
      CreateBots1700000000006,
      CreateBotRunCycles1700000000007,
      AddBrokerReconciliation1700000000008,
      AddCircuitBreakers1700000000009,
      AddBinanceOcoBracket1700000000010,
      AddBotOrderAttribution1700000000011,
    ],
    synchronize: false,
    migrationsRun: false,
    logging: ['error', 'warn'],
    poolSize: config.DB_POOL_MAX,
  });
}
