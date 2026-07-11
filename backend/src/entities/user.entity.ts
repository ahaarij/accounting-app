import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

export type UserRole = 'super_admin' | 'admin' | 'developer' | 'user';
export type UserStatus = 'pending' | 'active' | 'rejected';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  // select: false — never returned by default queries (GET /users etc.);
  // login explicitly selects it
  @Column({ type: 'varchar', name: 'password_hash', length: 255, select: false })
  passwordHash: string;

  @Column({ type: 'varchar', length: 20, default: 'user' })
  role: UserRole;

  @Column({ type: 'varchar', length: 20, default: 'active' })
  status: UserStatus;

  @Column({ type: 'varchar', length: 128, nullable: true, select: false, name: 'reset_token' })
  resetToken: string | null;

  @Column({ type: 'timestamp', nullable: true, select: false, name: 'reset_token_expires_at' })
  resetTokenExpiresAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
