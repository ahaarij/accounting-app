import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('reconciliation_flags')
export class ReconciliationFlag {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ length: 40 })
  flag_type: string;

  @Column({ nullable: true })
  bank_account_id: number;

  @Column({ nullable: true })
  daily_transaction_id: number;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ length: 10 })
  severity: string;

  @Column({ default: false })
  resolved: boolean;

  @CreateDateColumn()
  created_at: Date;
}
