import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBacktests1700000000004 implements MigrationInterface {
  name = 'CreateBacktests1700000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "backtests" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "strategy_id" character varying(128) NOT NULL,
      "config" jsonb NOT NULL DEFAULT '{}',
      "symbol" character varying(32) NOT NULL,
      "interval" character varying(8) NOT NULL,
      "candle_limit" integer NOT NULL,
      "starting_balance" numeric(40,20) NOT NULL,
      "fee_rate" numeric(40,20) NOT NULL,
      "slippage_rate" numeric(40,20) NOT NULL,
      "position_size" numeric(40,20) NOT NULL,
      "allow_short" boolean NOT NULL DEFAULT false,
      "risk_free_rate" numeric(40,20) NOT NULL DEFAULT 0,
      "net_profit" numeric(40,20) NOT NULL,
      "ending_balance" numeric(40,20) NOT NULL,
      "total_return" numeric(16,10) NOT NULL,
      "total_fees_paid" numeric(40,20) NOT NULL,
      "closed_trades" integer NOT NULL DEFAULT 0,
      "winning_trades" integer NOT NULL DEFAULT 0,
      "losing_trades" integer NOT NULL DEFAULT 0,
      "win_rate" numeric(8,6) NOT NULL DEFAULT 0,
      "max_drawdown" numeric(8,6) NOT NULL DEFAULT 0,
      "profit_factor" numeric(16,8),
      "sharpe" numeric(16,8),
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE TABLE "backtest_trades" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "backtest_id" uuid NOT NULL REFERENCES "backtests" ("id") ON DELETE CASCADE,
      "seq" integer NOT NULL,
      "side" character varying(8) NOT NULL,
      "timestamp" BIGINT NOT NULL,
      "price" numeric(40,20) NOT NULL,
      "quantity" numeric(40,20) NOT NULL,
      "fee" numeric(40,20) NOT NULL,
      "realized_pnl" numeric(40,20)
    )`);
    await queryRunner.query(`CREATE TABLE "backtest_equity_points" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "backtest_id" uuid NOT NULL REFERENCES "backtests" ("id") ON DELETE CASCADE,
      "seq" integer NOT NULL,
      "timestamp" BIGINT NOT NULL,
      "cash" numeric(40,20) NOT NULL,
      "position_value" numeric(40,20) NOT NULL,
      "equity" numeric(40,20) NOT NULL
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_backtest_trades_backtest_id_seq" ON "backtest_trades" ("backtest_id", "seq")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backtest_equity_points_backtest_id_seq" ON "backtest_equity_points" ("backtest_id", "seq")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "backtest_equity_points"`);
    await queryRunner.query(`DROP TABLE "backtest_trades"`);
    await queryRunner.query(`DROP TABLE "backtests"`);
  }
}
