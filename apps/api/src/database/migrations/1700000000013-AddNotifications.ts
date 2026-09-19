import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * In-app notification center (AGENTS.md §25, §38). Important events across
 * the platform — bot lifecycle first, later risk/order/broker — are persisted
 * per user so the web UI can surface them without trusting Redis as the source
 * of truth (AGENTS.md §13). Severity drives the UI tone; `link` points at the
 * affected page. Reading is user-scoped; `read_at` is set at read time so the
 * unread list is derivable without a separate boolean.
 */
export class AddNotifications1700000000013 implements MigrationInterface {
  name = 'AddNotifications1700000000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TABLE "notifications" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      "user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
      "type" varchar(48) NOT NULL,
      "severity" varchar(16) NOT NULL,
      "title" varchar(255) NOT NULL,
      "body" text NOT NULL,
      "link" varchar(512),
      "read_at" TIMESTAMP WITH TIME ZONE,
      "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
    )`);
    await queryRunner.query(`CREATE INDEX "idx_notifications_user_read_created"
      ON "notifications" ("user_id", "read_at", "created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notifications"`);
  }
}
