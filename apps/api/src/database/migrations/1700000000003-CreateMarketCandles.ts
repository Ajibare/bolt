import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateMarketCandles1700000000003 implements MigrationInterface {
  name = 'CreateMarketCandles1700000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "market_candles" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "symbol" character varying(32) NOT NULL,
      "interval" character varying(8) NOT NULL,
      "timestamp" BIGINT NOT NULL,
      "open" numeric(40,20) NOT NULL,
      "high" numeric(40,20) NOT NULL,
      "low" numeric(40,20) NOT NULL,
      "close" numeric(40,20) NOT NULL,
      "volume" numeric(40,20) NOT NULL,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_market_candles_symbol_interval_timestamp" UNIQUE ("symbol", "interval", "timestamp")
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_market_candles_symbol_interval_timestamp" ON "market_candles" ("symbol", "interval", "timestamp" DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_market_candles_timestamp" ON "market_candles" ("timestamp")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "market_candles"`);
  }
}
