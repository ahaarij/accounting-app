import { MigrationInterface, QueryRunner } from 'typeorm';

export class AuditLogs1000000000010 implements MigrationInterface {
  name = 'AuditLogs1000000000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" SERIAL PRIMARY KEY,
        "user_id" INTEGER,
        "user_email" VARCHAR(255),
        "user_name" VARCHAR(255),
        "entity_type" VARCHAR(100) NOT NULL,
        "description" TEXT NOT NULL,
        "ip_address" VARCHAR(50),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" ("created_at" DESC)`);
    await queryRunner.query(`CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" ("user_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
  }
}
