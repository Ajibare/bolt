import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Broker reconciliation groundwork (AGENTS.md §17). Orders gain the executing
 * provider, the latest broker-reported status, and a last-sync timestamp so a
 * reconciliation job can compare local state with broker state without mixing
 * paper and live ledgers.
 */
export class AddBrokerReconciliation1700000000008 implements MigrationInterface {
  name = 'AddBrokerReconciliation1700000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "paper_orders" ADD COLUMN "provider" character varying(16) NOT NULL DEFAULT 'paper'`,
    );
    await queryRunner.query(
      `ALTER TABLE "paper_orders" ADD COLUMN "broker_status" character varying(32)`,
    );
    await queryRunner.query(
      `ALTER TABLE "paper_orders" ADD COLUMN "last_synced_at" TIMESTAMP WITH TIME ZONE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "paper_orders" DROP COLUMN "last_synced_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "paper_orders" DROP COLUMN "broker_status"`,
    );
    await queryRunner.query(
      `ALTER TABLE "paper_orders" DROP COLUMN "provider"`,
    );
  }
}
