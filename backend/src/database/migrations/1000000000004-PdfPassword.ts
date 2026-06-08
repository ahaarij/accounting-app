import { MigrationInterface, QueryRunner } from 'typeorm';

export class PdfPassword1000000000004 implements MigrationInterface {
  name = 'PdfPassword1000000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "csv_accounts"
        ADD COLUMN IF NOT EXISTS "pdf_password" VARCHAR(500)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "csv_accounts" DROP COLUMN IF EXISTS "pdf_password"`);
  }
}
