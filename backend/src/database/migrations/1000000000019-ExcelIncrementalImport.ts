import { MigrationInterface, QueryRunner } from 'typeorm';

export class ExcelIncrementalImport1000000000019 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add group column to excel_accounts and backfill from excel_imports
    await queryRunner.query(`ALTER TABLE excel_accounts ADD COLUMN IF NOT EXISTS "group" CHAR(2)`);
    await queryRunner.query(`
      UPDATE excel_accounts ea
      SET "group" = ei."group"
      FROM excel_imports ei
      WHERE ea.import_id = ei.id
    `);

    // 2. Change import_id FK from CASCADE DELETE to SET NULL (accounts now outlive imports)
    await queryRunner.query(`ALTER TABLE excel_accounts DROP CONSTRAINT IF EXISTS excel_accounts_import_id_fkey`);
    await queryRunner.query(`ALTER TABLE excel_accounts ALTER COLUMN import_id DROP NOT NULL`);
    await queryRunner.query(`
      ALTER TABLE excel_accounts
      ADD CONSTRAINT excel_accounts_import_id_fkey
      FOREIGN KEY (import_id) REFERENCES excel_imports(id) ON DELETE SET NULL
    `);

    // 3. Dedup: if (somehow) multiple accounts share the same (group, sheet_name), keep the
    //    one from the most-recent import and remove the rest.
    await queryRunner.query(`
      DELETE FROM excel_accounts
      WHERE id NOT IN (
        SELECT DISTINCT ON ("group", sheet_name) id
        FROM excel_accounts
        ORDER BY "group", sheet_name, COALESCE(import_id, 0) DESC
      )
    `);

    // 4. Unique index: one account per (group, sheet_name)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS excel_accounts_group_sheet_key
      ON excel_accounts ("group", sheet_name)
    `);

    // 5. Add sheet_row_index to excel_transactions
    await queryRunner.query(`ALTER TABLE excel_transactions ADD COLUMN IF NOT EXISTS sheet_row_index INT`);

    // 6. Backfill sheet_row_index from sort_order.
    //    sort_order is reversed (0 = newest), so sheet_row_index (0 = oldest) = max_sort - sort_order.
    await queryRunner.query(`
      UPDATE excel_transactions et
      SET sheet_row_index = sub.max_so - et.sort_order
      FROM (
        SELECT account_id, MAX(sort_order) AS max_so
        FROM excel_transactions
        GROUP BY account_id
      ) sub
      WHERE et.account_id = sub.account_id
    `);

    // Safety: any rows still NULL (e.g. account with 0 transactions) get 0
    await queryRunner.query(`
      UPDATE excel_transactions SET sheet_row_index = 0 WHERE sheet_row_index IS NULL
    `);

    // 7. Unique index: one row per (account, sheet position)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS excel_transactions_account_row_key
      ON excel_transactions (account_id, sheet_row_index)
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS excel_transactions_account_row_key`);
    await queryRunner.query(`ALTER TABLE excel_transactions DROP COLUMN IF EXISTS sheet_row_index`);
    await queryRunner.query(`DROP INDEX IF EXISTS excel_accounts_group_sheet_key`);
    await queryRunner.query(`ALTER TABLE excel_accounts DROP CONSTRAINT IF EXISTS excel_accounts_import_id_fkey`);
    await queryRunner.query(`
      ALTER TABLE excel_accounts
      ADD CONSTRAINT excel_accounts_import_id_fkey
      FOREIGN KEY (import_id) REFERENCES excel_imports(id) ON DELETE CASCADE
    `);
    await queryRunner.query(`ALTER TABLE excel_accounts ALTER COLUMN import_id SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE excel_accounts DROP COLUMN IF EXISTS "group"`);
  }
}
