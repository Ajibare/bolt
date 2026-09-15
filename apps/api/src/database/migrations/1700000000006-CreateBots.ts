import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBots1700000000006 implements MigrationInterface {
  name = 'CreateBots1700000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "bots" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "name" character varying(64) NOT NULL,
      "strategy_id" character varying(128) NOT NULL,
      "config" jsonb NOT NULL DEFAULT '{}',
      "symbol" character varying(32) NOT NULL,
      "interval" character varying(8) NOT NULL,
      "risk_config" jsonb NOT NULL DEFAULT '{}',
      "paper_account_id" uuid NOT NULL REFERENCES "paper_accounts" ("id") ON DELETE CASCADE,
      "execution_mode" character varying(8) NOT NULL DEFAULT 'PAPER',
      "status" character varying(16) NOT NULL DEFAULT 'DRAFT',
      "quantity" numeric(40,20) NOT NULL,
      "stop_loss_percent" numeric(40,20) NOT NULL,
      "take_profit_percent" numeric(40,20),
      "last_signal_direction" character varying(8),
      "last_signal_reason" text,
      "last_signal_at" TIMESTAMP WITH TIME ZONE,
      "last_order_id" uuid,
      "last_order_status" character varying(32),
      "last_order_symbol" character varying(32),
      "last_error" text,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "uq_bots_user_name" UNIQUE ("user_id", "name")
    )`);
    await queryRunner.query(`CREATE INDEX "idx_bots_user"
      ON "bots" ("user_id")`);
    await queryRunner.query(`CREATE INDEX "idx_bots_user_status"
      ON "bots" ("user_id", "status")`);
    await queryRunner.query(`CREATE TABLE "bot_runs" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "bot_id" uuid NOT NULL REFERENCES "bots" ("id") ON DELETE CASCADE,
      "status" character varying(16) NOT NULL,
      "started_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "stopped_at" TIMESTAMP WITH TIME ZONE,
      "cycles_run" integer NOT NULL DEFAULT 0,
      "orders_placed" integer NOT NULL DEFAULT 0,
      "orders_rejected" integer NOT NULL DEFAULT 0,
      "last_cycle_at" TIMESTAMP WITH TIME ZONE,
      "error" text,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "idx_bot_runs_bot_id"
      ON "bot_runs" ("bot_id")`);
    await queryRunner.query(`CREATE INDEX "idx_bot_runs_bot_status"
      ON "bot_runs" ("bot_id", "status")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bot_runs"`);
    await queryRunner.query(`DROP TABLE "bots"`);
  }
}
