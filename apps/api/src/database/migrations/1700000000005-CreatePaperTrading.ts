import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePaperTrading1700000000005 implements MigrationInterface {
  name = 'CreatePaperTrading1700000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "paper_accounts" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "name" character varying(64) NOT NULL,
      "status" character varying(16) NOT NULL DEFAULT 'ACTIVE',
      "starting_cash" numeric(40,20) NOT NULL,
      "free_cash" numeric(40,20) NOT NULL,
      "realized_pnl" numeric(40,20) NOT NULL DEFAULT 0,
      "total_fees_paid" numeric(40,20) NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "uq_paper_accounts_user_name" UNIQUE ("user_id", "name")
    )`);
    await queryRunner.query(`CREATE TABLE "paper_orders" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "account_id" uuid NOT NULL REFERENCES "paper_accounts" ("id") ON DELETE CASCADE,
      "client_order_id" character varying(64) NOT NULL,
      "broker_order_id" character varying(64),
      "side" character varying(8) NOT NULL,
      "type" character varying(16) NOT NULL,
      "symbol" character varying(32) NOT NULL,
      "quantity" numeric(40,20) NOT NULL,
      "price" numeric(40,20),
      "stop_loss" numeric(40,20),
      "take_profit" numeric(40,20),
      "reduce_only" boolean NOT NULL DEFAULT false,
      "fee_rate" numeric(40,20) NOT NULL DEFAULT 0,
      "slippage_rate" numeric(40,20) NOT NULL DEFAULT 0,
      "status" character varying(32) NOT NULL,
      "filled_quantity" numeric(40,20) NOT NULL DEFAULT 0,
      "avg_fill_price" numeric(40,20),
      "fees" numeric(40,20) NOT NULL DEFAULT 0,
      "reason" character varying(255),
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "uq_paper_orders_account_client" UNIQUE ("account_id", "client_order_id")
    )`);
    await queryRunner.query(`CREATE INDEX "idx_paper_orders_account_status"
      ON "paper_orders" ("account_id", "status")`);
    await queryRunner.query(`CREATE TABLE "paper_positions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "account_id" uuid NOT NULL REFERENCES "paper_accounts" ("id") ON DELETE CASCADE,
      "symbol" character varying(32) NOT NULL,
      "side" character varying(8) NOT NULL DEFAULT 'long',
      "quantity" numeric(40,20) NOT NULL,
      "avg_entry_price" numeric(40,20) NOT NULL,
      "fees" numeric(40,20) NOT NULL DEFAULT 0,
      "realized_pnl" numeric(40,20) NOT NULL DEFAULT 0,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "uq_paper_positions_account_symbol" UNIQUE ("account_id", "symbol")
    )`);
    await queryRunner.query(`CREATE TABLE "paper_portfolio_snapshots" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "account_id" uuid NOT NULL REFERENCES "paper_accounts" ("id") ON DELETE CASCADE,
      "equity" numeric(40,20) NOT NULL,
      "cash" numeric(40,20) NOT NULL,
      "position_value" numeric(40,20) NOT NULL,
      "realized_pnl" numeric(40,20) NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "idx_paper_portfolio_snapshots_account_created"
      ON "paper_portfolio_snapshots" ("account_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "paper_portfolio_snapshots"`);
    await queryRunner.query(`DROP TABLE "paper_positions"`);
    await queryRunner.query(`DROP TABLE "paper_orders"`);
    await queryRunner.query(`DROP TABLE "paper_accounts"`);
  }
}
