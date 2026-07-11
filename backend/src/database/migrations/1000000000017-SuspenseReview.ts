import { MigrationInterface, QueryRunner } from 'typeorm';

export class SuspenseReview1000000000017 implements MigrationInterface {
  name = 'SuspenseReview1000000000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // User-assigned friendly name for a transaction (set when classifying suspense entries)
    await queryRunner.query(`
      ALTER TABLE csv_transactions ADD COLUMN IF NOT EXISTS custom_label VARCHAR(255)
    `);

    // Remembered classifications: future imports with the same (normalised)
    // description are auto-classified instead of landing in suspense again
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS suspense_rules (
        id SERIAL PRIMARY KEY,
        match_text TEXT NOT NULL UNIQUE,
        label VARCHAR(255),
        transaction_type VARCHAR(100) NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS suspense_rules`);
    await queryRunner.query(`ALTER TABLE csv_transactions DROP COLUMN IF EXISTS custom_label`);
  }
}
