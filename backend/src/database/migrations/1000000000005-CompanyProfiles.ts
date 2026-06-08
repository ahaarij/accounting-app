import { MigrationInterface, QueryRunner } from 'typeorm';

export class CompanyProfiles1000000000005 implements MigrationInterface {
  name = 'CompanyProfiles1000000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "company_profiles" (
        "id" SERIAL PRIMARY KEY,
        "category" CHAR(1) CHECK (category IN ('A','B','C')),
        "company_name" VARCHAR(500) NOT NULL UNIQUE,
        "owner_name" VARCHAR(255),
        "address" TEXT,
        "turnover_aed" NUMERIC(15,2),
        "logo_path" VARCHAR(500),
        "company_active_accounts" TEXT,
        "personal_active_accounts" TEXT,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "buyers_suppliers" (
        "id" SERIAL PRIMARY KEY,
        "name" VARCHAR(500) NOT NULL,
        "type" VARCHAR(10) NOT NULL DEFAULT 'buyer' CHECK (type IN ('buyer','supplier','both')),
        "address" TEXT,
        "contact_info" TEXT,
        "linked_company_id" INTEGER REFERENCES "company_profiles"("id") ON DELETE SET NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "company_party_links" (
        "id" SERIAL PRIMARY KEY,
        "company_id" INTEGER NOT NULL REFERENCES "company_profiles"("id") ON DELETE CASCADE,
        "party_id" INTEGER NOT NULL REFERENCES "buyers_suppliers"("id") ON DELETE CASCADE,
        "relationship" VARCHAR(10) NOT NULL CHECK (relationship IN ('buyer','supplier')),
        UNIQUE ("company_id", "party_id", "relationship")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "company_party_links"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "buyers_suppliers"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "company_profiles"`);
  }
}
