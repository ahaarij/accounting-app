/**
 * One-off utility: encrypt any legacy plaintext secrets already in the
 * database (email_config.app_password, csv_accounts.pdf_password).
 * Safe to re-run — already-encrypted values are skipped.
 *
 *   cd backend && npx tsx scripts/encrypt-existing-secrets.ts
 *
 * Requires ENCRYPTION_KEY (and DB_PASSWORD or DATABASE_URL) in the env/.env.
 */
import { config } from 'dotenv';
config();
import { Client } from 'pg';
import { encryptSecret, isEncrypted } from '../src/common/crypto.util';

async function main() {
  if (!process.env.ENCRYPTION_KEY) {
    console.error('ENCRYPTION_KEY is not set');
    process.exit(1);
  }
  const client = process.env.DATABASE_URL
    ? new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : new Client({
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432'),
        user: process.env.DB_USER || 'reconciliation',
        password: process.env.DB_PASSWORD,
        database: process.env.DB_NAME || 'reconciliation',
      });
  await client.connect();

  const { rows } = await client.query(`SELECT id, app_password FROM email_config`);
  for (const r of rows) {
    if (r.app_password && !isEncrypted(r.app_password)) {
      await client.query(`UPDATE email_config SET app_password = $1 WHERE id = $2`, [encryptSecret(r.app_password), r.id]);
      console.log(`email_config #${r.id}: app password encrypted`);
    }
  }

  const pdfs = await client.query(`SELECT id, pdf_password FROM csv_accounts WHERE pdf_password IS NOT NULL`);
  for (const r of pdfs.rows) {
    if (!isEncrypted(r.pdf_password)) {
      await client.query(`UPDATE csv_accounts SET pdf_password = $1 WHERE id = $2`, [encryptSecret(r.pdf_password), r.id]);
      console.log(`csv_account #${r.id}: pdf password encrypted`);
    }
  }

  await client.end();
  console.log('done');
}

main().catch((e) => { console.error(e); process.exit(1); });
