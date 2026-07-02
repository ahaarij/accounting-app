import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('email_config')
export class EmailConfig {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar' })
  email: string;

  @Column({ type: 'varchar' })
  app_password: string;

  @Column({ type: 'int', default: 5 })
  poll_interval_minutes: number;

  @Column({ type: 'boolean', default: false })
  is_active: boolean;

  @Column({ type: 'varchar', nullable: true })
  sender_filter: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
