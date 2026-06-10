import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyProfileExtras1000000000011 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE company_profiles
        ADD COLUMN IF NOT EXISTS country VARCHAR(100),
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS contact_emails TEXT,
        ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE company_profiles
        DROP COLUMN IF EXISTS country,
        DROP COLUMN IF EXISTS is_active,
        DROP COLUMN IF EXISTS contact_emails,
        DROP COLUMN IF EXISTS contact_phone
    `);
  }
}
