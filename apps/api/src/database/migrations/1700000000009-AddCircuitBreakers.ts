import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Persistent circuit breaker (AGENTS.md §19). A tripped breaker survives a
 * process restart so a critical shutdown never silently auto-resumes; only an
 * explicit reset removes a row. `severity` is the natural key — a breaker is
 * identified by its scope label ('global', 'account:<id>', 'bot:<id>').
 */
export class AddCircuitBreakers1700000000009 implements MigrationInterface {
  name = 'AddCircuitBreakers1700000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "circuit_breakers" (
        "severity" character varying(64) NOT NULL,
        "reason" text NOT NULL,
        "tripped_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "pk_circuit_breakers_severity" PRIMARY KEY ("severity")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "circuit_breakers"`);
  }
}
