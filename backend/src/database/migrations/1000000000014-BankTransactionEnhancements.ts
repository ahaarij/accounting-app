import { MigrationInterface, QueryRunner } from 'typeorm';

export class BankTransactionEnhancements1000000000014 implements MigrationInterface {
  name = 'BankTransactionEnhancements1000000000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "value_date" DATE`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "counterparty" VARCHAR(500)`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "transaction_type" VARCHAR(100)`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "is_charge" BOOLEAN NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "parent_transaction_id" INTEGER REFERENCES "csv_transactions"("id") ON DELETE CASCADE`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "fx_rate" NUMERIC(12,6)`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "fx_original_amount" NUMERIC(15,2)`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "fx_original_currency" VARCHAR(10)`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" ADD COLUMN IF NOT EXISTS "bank_detected" VARCHAR(50)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_csv_tx_parent" ON "csv_transactions"("parent_transaction_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "idx_csv_tx_dedup" ON "csv_transactions"("csv_account_id","date","ref","debit","credit")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_csv_tx_dedup"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_csv_tx_parent"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "bank_detected"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "fx_original_currency"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "fx_original_amount"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "fx_rate"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "parent_transaction_id"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "is_charge"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "transaction_type"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "counterparty"`);
    await queryRunner.query(`ALTER TABLE "csv_transactions" DROP COLUMN IF EXISTS "value_date"`);
  }
}
