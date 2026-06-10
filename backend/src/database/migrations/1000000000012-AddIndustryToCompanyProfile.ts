import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIndustryToCompanyProfile1000000000012 implements MigrationInterface {
  async up(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE company_profiles
        ADD COLUMN IF NOT EXISTS industry VARCHAR(100) DEFAULT NULL
    `);
  }

  async down(runner: QueryRunner) {
    await runner.query(`
      ALTER TABLE company_profiles
        DROP COLUMN IF EXISTS industry
    `);
  }
}
