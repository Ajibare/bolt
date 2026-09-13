import 'dotenv/config';
import { buildDataSource } from './data-source.js';

async function main(): Promise<void> {
  const dataSource = buildDataSource();
  await dataSource.initialize();
  try {
    await dataSource.query(
      `INSERT INTO "app_meta" ("key", "value", "updated_at")
       VALUES ('seeded_at', $1, now())
       ON CONFLICT ("key") DO UPDATE SET "value" = EXCLUDED."value", "updated_at" = now()`,
      [new Date().toISOString()],
    );
    console.log('[db] Seed complete');
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[db] Seed failed', error);
  process.exitCode = 1;
});
