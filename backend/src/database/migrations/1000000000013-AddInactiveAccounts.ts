import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInactiveAccounts1000000000013 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS company_inactive_accounts TEXT DEFAULT NULL`);
    await queryRunner.query(`ALTER TABLE company_profiles ADD COLUMN IF NOT EXISTS personal_inactive_accounts TEXT DEFAULT NULL`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE company_profiles DROP COLUMN IF EXISTS company_inactive_accounts`);
    await queryRunner.query(`ALTER TABLE company_profiles DROP COLUMN IF EXISTS personal_inactive_accounts`);
  }
}
