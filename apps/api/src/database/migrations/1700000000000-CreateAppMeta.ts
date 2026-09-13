import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAppMeta1700000000000 implements MigrationInterface {
  name = 'CreateAppMeta1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "app_meta" (
        "key" character varying NOT NULL,
        "value" character varying,
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_meta_key" PRIMARY KEY ("key")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "app_meta"`);
  }
}
