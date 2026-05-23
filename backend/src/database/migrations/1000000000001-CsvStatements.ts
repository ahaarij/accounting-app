import { MigrationInterface, QueryRunner } from 'typeorm';

export class CsvStatements1000000000001 implements MigrationInterface {
  name = 'CsvStatements1000000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "csv_accounts" (
        "id" SERIAL PRIMARY KEY,
        "account_number" VARCHAR(100) NOT NULL UNIQUE,
        "company_name" VARCHAR(255) NOT NULL,
        "currency" VARCHAR(10) NOT NULL DEFAULT 'AED',
        "bank_name" VARCHAR(255) NOT NULL,
        "iban" VARCHAR(100),
        "branch" VARCHAR(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "csv_transactions" (
        "id" SERIAL PRIMARY KEY,
        "csv_account_id" INTEGER NOT NULL REFERENCES "csv_accounts"("id") ON DELETE CASCADE,
        "date" DATE NOT NULL,
        "description" TEXT,
        "ref" VARCHAR(255),
        "debit" NUMERIC(15,2),
        "credit" NUMERIC(15,2),
        "balance" NUMERIC(15,2),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_csv_tx_account_date" ON "csv_transactions"("csv_account_id","date")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "csv_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "csv_accounts"`);
  }
}
