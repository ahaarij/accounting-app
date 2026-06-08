import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyCashDeposits1000000000007 implements MigrationInterface {
  name = 'CompanyCashDeposits1000000000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "company_cash_deposits" (
        "id" SERIAL PRIMARY KEY,
        "company_id" INTEGER NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
        "date" DATE NOT NULL,
        "description" VARCHAR(500),
        "amount" NUMERIC(15,2) NOT NULL,
        "currency" VARCHAR(10) NOT NULL DEFAULT 'AED',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`CREATE INDEX "idx_ccd_company_id" ON "company_cash_deposits" ("company_id")`);
    await queryRunner.query(`CREATE INDEX "idx_ccd_date" ON "company_cash_deposits" ("date")`);

    await queryRunner.query(`
      CREATE TABLE "deposit_limit_settings" (
        "id" INTEGER PRIMARY KEY DEFAULT 1,
        "per_transaction_limit" NUMERIC(15,2) NOT NULL DEFAULT 250000,
        "monthly_limit" NUMERIC(15,2) NOT NULL DEFAULT 500000,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      INSERT INTO "deposit_limit_settings" ("id", "per_transaction_limit", "monthly_limit")
      VALUES (1, 250000, 500000)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "company_cash_deposits"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "deposit_limit_settings"`);
  }
}
