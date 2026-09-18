import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Binance protective bracket tracking (AGENTS.md §17/§14). A Binance long
 * entry is protected by a separate SELL OCO placed after the fill; the
 * broker's order-list id is recorded here so the bracket is visible to
 * reconciliation and audit without fabricating new order rows.
 */
export class AddBinanceOcoBracket1700000000010 implements MigrationInterface {
  name = 'AddBinanceOcoBracket1700000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "paper_orders" ADD COLUMN "bracket_order_list_id" character varying(64)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "paper_orders" DROP COLUMN "bracket_order_list_id"`,
    );
  }
}
