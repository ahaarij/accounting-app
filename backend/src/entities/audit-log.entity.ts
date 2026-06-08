import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('audit_logs')
export class AuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'integer', nullable: true })
  user_id: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_email: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  user_name: string;

  @Column({ type: 'varchar', length: 100 })
  entity_type: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  ip_address: string;

  @CreateDateColumn()
  created_at: Date;
}
