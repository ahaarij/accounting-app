import { MigrationInterface, QueryRunner } from 'typeorm';

export class AppSettingsAndPasswordReset1000000000020 implements MigrationInterface {
  async up(runner: QueryRunner): Promise<void> {
    await runner.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        key   VARCHAR(100) PRIMARY KEY,
        value TEXT
      )
    `);

    await runner.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS reset_token           VARCHAR(128),
        ADD COLUMN IF NOT EXISTS reset_token_expires_at TIMESTAMP
    `);
  }

  async down(runner: QueryRunner): Promise<void> {
    await runner.query(`ALTER TABLE users DROP COLUMN IF EXISTS reset_token_expires_at`);
    await runner.query(`ALTER TABLE users DROP COLUMN IF EXISTS reset_token`);
    await runner.query(`DROP TABLE IF EXISTS app_settings`);
  }
}
