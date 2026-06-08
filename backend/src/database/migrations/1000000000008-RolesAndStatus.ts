import { MigrationInterface, QueryRunner } from 'typeorm';
import * as bcrypt from 'bcryptjs';

export class RolesAndStatus1000000000008 implements MigrationInterface {
  name = 'RolesAndStatus1000000000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add status column (existing users are already active)
    await queryRunner.query(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
    `);

    // Migrate old roles → new roles
    // accountant → admin  (accounting team = admin)
    // viewer    → user
    // admin stays admin
    await queryRunner.query(`UPDATE users SET role = 'admin' WHERE role = 'accountant'`);
    await queryRunner.query(`UPDATE users SET role = 'user'  WHERE role = 'viewer'`);

    // Seed the super admin account (upsert so re-runs are safe)
    const hash = await bcrypt.hash('SuperAdmin123!', 10);
    await queryRunner.query(
      `INSERT INTO users (name, email, password_hash, role, status)
       VALUES ('Super Admin', 'superadmin@recon.ae', $1, 'super_admin', 'active')
       ON CONFLICT (email) DO UPDATE SET role = 'super_admin', status = 'active'`,
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
