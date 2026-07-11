import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExcelSuspense1000000000018 implements MigrationInterface {
  name = 'ExcelSuspense1000000000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Excel Balance transactions join the same suspense-review system as
    // PDF/CSV statement transactions
    await queryRunner.query(`
      ALTER TABLE excel_transactions ADD COLUMN IF NOT EXISTS custom_label VARCHAR(255)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE excel_transactions DROP COLUMN IF EXISTS custom_label`);
  }
}
