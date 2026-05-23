import { MigrationInterface, QueryRunner } from 'typeorm';

export class SalesInvoices1000000000002 implements MigrationInterface {
  name = 'SalesInvoices1000000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "sales_invoices" (
        "id" SERIAL PRIMARY KEY,
        "source_company" VARCHAR(50) NOT NULL,
        "customer_name" VARCHAR(255),
        "voucher_no" VARCHAR(100),
        "voucher_ref_no" VARCHAR(100),
        "invoice_date" DATE,
        "gross_total" NUMERIC(15,2),
        "product" TEXT,
        "currency" VARCHAR(10) NOT NULL DEFAULT 'AED',
        "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
        "filename" VARCHAR(255),
        "import_date" DATE NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now()
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "sales_invoices"`);
  }
}
