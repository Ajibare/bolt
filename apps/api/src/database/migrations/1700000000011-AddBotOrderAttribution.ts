import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bot attribution on the order ledger (AGENTS.md §13/§17). Every order placed
 * by a bot records the bot and the run that produced it, so round-trip trades
 * can be analysed per bot/strategy (Phase 10 analytics). Both columns stay
 * NULL for manual paper orders. Existing orders are backfilled through the
 * immutable `bot_run_cycles` audit trail (`cycle.order_id -> paper_orders.id`),
 * so historical bot trades gain attribution without fabricating data.
 */
export class AddBotOrderAttribution1700000000011 implements MigrationInterface {
  name = 'AddBotOrderAttribution1700000000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "paper_orders" ADD COLUMN "bot_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "paper_orders" ADD COLUMN "bot_run_id" uuid`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_paper_orders_account_bot"
        ON "paper_orders" ("account_id", "bot_id")`,
    );
    await queryRunner.query(
      `UPDATE "paper_orders" o
        SET "bot_id" = r."bot_id", "bot_run_id" = c."run_id"
        FROM "bot_run_cycles" c
        JOIN "bot_runs" r ON r."id" = c."run_id"
        WHERE c."order_id" = o."id" AND o."bot_id" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_paper_orders_account_bot"`);
    await queryRunner.query(
      `ALTER TABLE "paper_orders" DROP COLUMN "bot_run_id"`,
    );
    await queryRunner.query(`ALTER TABLE "paper_orders" DROP COLUMN "bot_id"`);
  }
}
