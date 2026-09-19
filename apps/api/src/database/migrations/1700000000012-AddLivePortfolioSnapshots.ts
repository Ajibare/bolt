import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Live portfolio equity snapshots (AGENTS.md §13). The broker only reports a
 * point-in-time balance; persisting an immutable snapshot on a recurring tick
 * lets the analytics phase rebuild a live-account equity curve exactly like
 * the paper one, without replaying candles or trusting Redis as the source of
 * truth. Equity/cash are summed straight from the broker's reported balances.
 * Position value and realized P&L are not yet derivable from spot balances and
 * stay zero until a marking oracle exists — the curve only uses equity.
 */
export class AddLivePortfolioSnapshots1700000000012 implements MigrationInterface {
  name = 'AddLivePortfolioSnapshots1700000000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "live_portfolio_snapshots" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "account_id" uuid NOT NULL REFERENCES "paper_accounts" ("id") ON DELETE CASCADE,
      "equity" numeric(40,20) NOT NULL,
      "cash" numeric(40,20) NOT NULL,
      "position_value" numeric(40,20) NOT NULL,
      "realized_pnl" numeric(40,20) NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "idx_live_portfolio_snapshots_account_created"
      ON "live_portfolio_snapshots" ("account_id", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "live_portfolio_snapshots"`);
  }
}
