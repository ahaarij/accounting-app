import { MigrationInterface, QueryRunner } from 'typeorm';

export class CashDepositsBankAccount1000000000009 implements MigrationInterface {
  name = 'CashDepositsBankAccount1000000000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add bank_account column to company_cash_deposits
    await queryRunner.query(`
      ALTER TABLE "company_cash_deposits"
      ADD COLUMN IF NOT EXISTS "bank_account" VARCHAR(255)
    `);

    // Create per-company per-account deposit limits table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "company_deposit_limits" (
        "company_id" INTEGER NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
        "bank_account" VARCHAR(100) NOT NULL,
        "per_tx_limit" NUMERIC(15,2) NOT NULL DEFAULT 250000,
        "monthly_limit" NUMERIC(15,2) NOT NULL DEFAULT 500000,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        PRIMARY KEY ("company_id", "bank_account")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "company_deposit_limits"`);
    await queryRunner.query(`ALTER TABLE "company_cash_deposits" DROP COLUMN IF EXISTS "bank_account"`);
  }
}
