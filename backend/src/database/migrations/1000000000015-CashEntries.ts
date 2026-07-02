import { MigrationInterface, QueryRunner } from 'typeorm';

export class CashEntries1000000000015 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cash_entries (
        id          SERIAL PRIMARY KEY,
        date        DATE NOT NULL,
        description VARCHAR(500),
        cash_in     NUMERIC(15,2),
        cash_out    NUMERIC(15,2),
        balance     NUMERIC(15,2),
        notes       TEXT,
        currency    VARCHAR(10) NOT NULL DEFAULT 'AED',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS cash_entries`);
  }
}
