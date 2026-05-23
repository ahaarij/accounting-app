import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('reconciliation_results')
export class ReconciliationResult {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', nullable: true })
  bank_account_id: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  expected_closing_balance: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  actual_closing_balance: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  difference: number;

  @Column({ length: 15 })
  status: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @CreateDateColumn()
  created_at: Date;
}
