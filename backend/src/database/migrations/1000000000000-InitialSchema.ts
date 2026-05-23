import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1000000000000 implements MigrationInterface {
  name = 'InitialSchema1000000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL,
        "email" VARCHAR(255) NOT NULL UNIQUE,
        "password_hash" VARCHAR(255) NOT NULL,
        "role" VARCHAR(20) NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','accountant','viewer')),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "companies" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(255) NOT NULL,
        "group" CHAR(1) NOT NULL CHECK ("group" IN ('A','B')),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "bank_accounts" (
        "id" SERIAL PRIMARY KEY,
        "company_id" INTEGER NOT NULL REFERENCES "companies"("id") ON DELETE CASCADE,
        "bank_name" VARCHAR(100) NOT NULL,
        "currency" CHAR(3) NOT NULL CHECK (currency IN ('AED','USD','EUR')),
        "account_code" VARCHAR(20),
        "status" VARCHAR(30) NOT NULL DEFAULT 'active' CHECK (status IN ('active','blocked','kyc_issue','na','not_working','online_issue','disabled','closed')),
        "remarks" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "daily_balances" (
        "id" SERIAL PRIMARY KEY,
        "bank_account_id" INTEGER NOT NULL REFERENCES "bank_accounts"("id") ON DELETE CASCADE,
        "date" DATE NOT NULL,
        "opening_balance" NUMERIC(15,2),
        "closing_balance" NUMERIC(15,2),
        "currency" CHAR(3) NOT NULL,
        "file_source" VARCHAR(10) NOT NULL CHECK (file_source IN ('group_a','group_b')),
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        UNIQUE("bank_account_id","date")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "account_transactions" (
        "id" SERIAL PRIMARY KEY,
        "bank_account_id" INTEGER NOT NULL REFERENCES "bank_accounts"("id") ON DELETE CASCADE,
        "date" DATE NOT NULL,
        "particular" TEXT,
        "deposit" NUMERIC(15,2),
        "withdrawal" NUMERIC(15,2),
        "running_balance" NUMERIC(15,2),
        "currency" CHAR(3) NOT NULL,
        "raw_sheet_name" VARCHAR(255),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "daily_transactions" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "particulars" VARCHAR(255),
        "source_bank" VARCHAR(100),
        "beneficiary" VARCHAR(255),
        "destination_bank" VARCHAR(100),
        "remittance_ref" VARCHAR(255),
        "amount_aed" NUMERIC(15,2),
        "amount_usd" NUMERIC(15,2),
        "amount_eur" NUMERIC(15,2),
        "pi_reference" VARCHAR(255),
        "invoice_number" VARCHAR(255),
        "transport_ref" VARCHAR(255),
        "reference" VARCHAR(255),
        "transaction_type" VARCHAR(30) CHECK (transaction_type IN ('bank_charges','inward','outward','intergroup','cash_deposit','currency_conversion','finance_repayment')),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "daily_cashflow" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "transaction_group" VARCHAR(100),
        "amount_aed" NUMERIC(15,2),
        "amount_usd" NUMERIC(15,2),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "counterparty_ledger" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "counterparty_name" VARCHAR(255) NOT NULL,
        "opening_balance_aed" NUMERIC(15,2),
        "opening_balance_usd" NUMERIC(15,2),
        "inward_fund" NUMERIC(15,2),
        "outward_fund" NUMERIC(15,2),
        "commission_aed" NUMERIC(15,2),
        "closing_balance_aed" NUMERIC(15,2),
        "closing_balance_usd" NUMERIC(15,2),
        "status" VARCHAR(20) CHECK (status IN ('owed_to_them','owed_by_them')),
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reconciliation_results" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "bank_account_id" INTEGER REFERENCES "bank_accounts"("id") ON DELETE CASCADE,
        "expected_closing_balance" NUMERIC(15,2),
        "actual_closing_balance" NUMERIC(15,2),
        "difference" NUMERIC(15,2),
        "status" VARCHAR(15) NOT NULL CHECK (status IN ('matched','discrepancy')),
        "notes" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "reconciliation_flags" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "flag_type" VARCHAR(40) NOT NULL CHECK (flag_type IN ('negative_balance','account_blocked','intergroup_mismatch','missing_invoice','duplicate_transaction','currency_conversion_missing','stale_account')),
        "bank_account_id" INTEGER REFERENCES "bank_accounts"("id") ON DELETE CASCADE,
        "daily_transaction_id" INTEGER REFERENCES "daily_transactions"("id") ON DELETE SET NULL,
        "description" TEXT,
        "severity" VARCHAR(10) NOT NULL CHECK (severity IN ('critical','warning','info')),
        "resolved" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "import_log" (
        "id" SERIAL PRIMARY KEY,
        "date" DATE NOT NULL,
        "file_type" VARCHAR(20) NOT NULL CHECK (file_type IN ('group_a','group_b','transactions','cashflow')),
        "filename" VARCHAR(255),
        "status" VARCHAR(10) NOT NULL CHECK (status IN ('success','failed','partial')),
        "records_imported" INTEGER DEFAULT 0,
        "errors" JSONB,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "import_log"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_flags"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reconciliation_results"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "counterparty_ledger"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_cashflow"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "account_transactions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "daily_balances"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bank_accounts"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "companies"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
  }
}
