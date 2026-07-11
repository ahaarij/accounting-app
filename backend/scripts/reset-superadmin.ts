/**
 * Rotate a user's password from the command line (defaults to the seeded
 * super admin). Usage:
 *
 *   cd backend
 *   pnpm run reset-superadmin -- 'NewStrongPassword'
 *   pnpm run reset-superadmin -- 'NewStrongPassword' someone@example.com
 *
 * Uses pg directly (not TypeORM) because tsx does not emit decorator metadata.
 */
import { config } from 'dotenv';
config();
import { Client } from 'pg';
import * as bcrypt from 'bcryptjs';

async function main() {
  const [password, email = 'superadmin@recon.ae'] = process.argv.slice(2);
  if (!password || password.length < 12) {
    console.error('Usage: pnpm run reset-superadmin -- <new-password (min 12 chars)> [email]');
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
  const hash = await bcrypt.hash(password, 10);
  const res = await client.query(
    `UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email, role`,
    [hash, email],
  );
  await client.end();

  if (!res.rows.length) {
    console.error(`No user found with email ${email}`);
    process.exit(1);
  }
  console.log(`Password updated for ${email} (role: ${res.rows[0].role})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
