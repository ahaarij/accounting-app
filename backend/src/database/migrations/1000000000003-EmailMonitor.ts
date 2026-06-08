import { MigrationInterface, QueryRunner } from 'typeorm';

export class EmailMonitor1000000000003 implements MigrationInterface {
  name = 'EmailMonitor1000000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "email_import_type_enum" AS ENUM ('group-a', 'group-b', 'transactions', 'cashflow')
    `);

    await queryRunner.query(`
      CREATE TABLE "email_config" (
        "id" SERIAL PRIMARY KEY,
        "email" VARCHAR NOT NULL,
        "app_password" VARCHAR NOT NULL,
        "poll_interval_minutes" INT NOT NULL DEFAULT 5,
        "is_active" BOOLEAN NOT NULL DEFAULT false,
        "import_type" "email_import_type_enum" NOT NULL DEFAULT 'transactions',
        "sender_filter" VARCHAR,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "processed_emails" (
        "id" SERIAL PRIMARY KEY,
        "message_id" VARCHAR NOT NULL UNIQUE,
        "filename" VARCHAR NOT NULL,
        "imported_at" TIMESTAMP NOT NULL DEFAULT now(),
        "import_type" VARCHAR NOT NULL,
        "records_imported" INT NOT NULL DEFAULT 0,
        "error" VARCHAR
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "processed_emails"`);
    await queryRunner.query(`DROP TABLE "email_config"`);
    await queryRunner.query(`DROP TYPE "email_import_type_enum"`);
  }
}
