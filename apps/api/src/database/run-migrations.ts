import 'dotenv/config';
import { buildDataSource } from './data-source.js';

async function main(): Promise<void> {
  const dataSource = buildDataSource();
  await dataSource.initialize();
  try {
    const applied = await dataSource.runMigrations();
    if (applied.length === 0) {
      console.log('[db] No pending migrations');
    } else {
      console.log(
        `[db] Applied migrations: ${applied.map((m) => m.name).join(', ')}`,
      );
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error: unknown) => {
  console.error('[db] Migration failed', error);
  process.exitCode = 1;
});
