import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

export class RolesAndStatus1000000000008 implements MigrationInterface {
  name = 'RolesAndStatus1000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old role constraint before any data changes
    await queryRunner.query(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);

    // Add new roles constraint
    await queryRunner.query(`
      ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('super_admin', 'admin', 'developer', 'user'))
    `);

    // Add status column (existing users are already active)
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
    `);

    // Migrate old roles → new roles
    await queryRunner.query(`UPDATE users SET role = 'admin' WHERE role = 'accountant'`);
    await queryRunner.query(`UPDATE users SET role = 'user'  WHERE role = 'viewer'`);

    // Seed the super admin account on fresh installs only. The password must
    // be provided explicitly via SUPERADMIN_PASSWORD so it is never hardcoded
    // in the repo. DO NOTHING (not DO UPDATE) so a re-run can never reset the
    // password or force the role back.
    const seedPassword = process.env.SUPERADMIN_PASSWORD;
    if (!seedPassword) {
      throw new Error('SUPERADMIN_PASSWORD environment variable is not set — refusing to seed super admin');
    }
    const hash = await bcrypt.hash(seedPassword, 10);
    await queryRunner.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Super Admin', 'superadmin@recon.ae', $1, 'super_admin', 'active')
       ON CONFLICT (email) DO NOTHING`,
      [hash],
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM users WHERE email = 'superadmin@recon.ae'`);
    await queryRunner.query(`UPDATE users SET role = 'viewer'     WHERE role = 'user'`);
    await queryRunner.query(`UPDATE users SET role = 'accountant' WHERE role = 'admin' AND email != 'admin@recon.ae'`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS status`);
  }
}
