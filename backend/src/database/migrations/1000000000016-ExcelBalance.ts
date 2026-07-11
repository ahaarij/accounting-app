import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExcelBalance1000000000016 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS excel_imports (
        id            SERIAL PRIMARY KEY,
        filename      VARCHAR(255) NOT NULL,
        "group"       CHAR(2),
        account_count INTEGER NOT NULL DEFAULT 0,
        imported_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS excel_accounts (
        id              SERIAL PRIMARY KEY,
        import_id       INTEGER NOT NULL REFERENCES excel_imports(id) ON DELETE CASCADE,
        sheet_name      VARCHAR(255) NOT NULL,
        company_name    VARCHAR(255),
        bank_name       VARCHAR(100),
        currency        VARCHAR(10),
        account_code    VARCHAR(20),
        remarks         VARCHAR(255),
        closing_balance NUMERIC(15,2),
        transaction_count INTEGER NOT NULL DEFAULT 0,
        sort_order      INTEGER NOT NULL DEFAULT 0
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS excel_transactions (
        id                SERIAL PRIMARY KEY,
        account_id        INTEGER NOT NULL REFERENCES excel_accounts(id) ON DELETE CASCADE,
        date              DATE,
        particular        TEXT,
        deposit           NUMERIC(15,2),
        withdrawal        NUMERIC(15,2),
        balance           NUMERIC(15,2),
        transaction_type  VARCHAR(50),
        is_opening_balance BOOLEAN NOT NULL DEFAULT false,
        sort_order        INTEGER NOT NULL DEFAULT 0
      )
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS excel_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS excel_accounts`);
    await queryRunner.query(`DROP TABLE IF EXISTS excel_imports`);
  }
}
