import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessions1700000000002 implements MigrationInterface {
  name = 'CreateSessions1700000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "sessions" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL,
      "refresh_token_hash" character varying(64) NOT NULL,
      "expires_at" TIMESTAMP WITH TIME ZONE NOT NULL,
      "revoked_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
      CONSTRAINT "UQ_sessions_refresh_token_hash" UNIQUE ("refresh_token_hash"),
      CONSTRAINT "FK_sessions_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
    )`);
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_sessions_expires_at" ON "sessions" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
