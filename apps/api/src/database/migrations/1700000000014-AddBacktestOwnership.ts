import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Scopes stored backtest reports to their owner (AGENTS.md §13/§23). The
 * column is nullable because pre-existing rows have no knowable owner;
 * unowned rows match no user and are therefore never returned. `ON DELETE SET
 * NULL` is deliberate rather than the usual CASCADE: backtest reports are
 * historical records and must not be silently deleted (AGENTS.md §13).
 */
export class AddBacktestOwnership1700000000014 implements MigrationInterface {
  name = 'AddBacktestOwnership1700000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "backtests" ADD COLUMN "user_id" uuid REFERENCES "users" ("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backtests_user_created" ON "backtests" ("user_id", "created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_backtests_user_created"`);
    await queryRunner.query(`ALTER TABLE "backtests" DROP COLUMN "user_id"`);
  }
}
