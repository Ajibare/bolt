import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Immutable per-cycle execution history for bot runs. Each cycle records the
 * strategy signal, the resulting risk-gated order (or its rejection), and any
 * failure detail — the audit trail behind the `bot_runs` counters
 * (AGENTS.md §13, roadmap §Bot Monitoring).
 */
export class CreateBotRunCycles1700000000007 implements MigrationInterface {
  name = 'CreateBotRunCycles1700000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "bot_run_cycles" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "run_id" uuid NOT NULL REFERENCES "bot_runs" ("id") ON DELETE CASCADE,
      "seq" integer NOT NULL,
      "signal_direction" character varying(8),
      "signal_reason" text,
      "signal_at" TIMESTAMP WITH TIME ZONE,
      "order_id" uuid,
      "order_status" character varying(32),
      "order_side" character varying(8),
      "order_symbol" character varying(32),
      "rejection_reason" text,
      "error" text,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "idx_bot_run_cycles_run_id"
      ON "bot_run_cycles" ("run_id")`);
    await queryRunner.query(`CREATE INDEX "idx_bot_run_cycles_run_seq"
      ON "bot_run_cycles" ("run_id", "seq")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "bot_run_cycles"`);
  }
}
