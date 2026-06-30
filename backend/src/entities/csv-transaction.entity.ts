import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CsvAccount } from './csv-account.entity';

@Entity('csv_transactions')
export class CsvTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  csv_account_id: number;

  @ManyToOne(() => CsvAccount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'csv_account_id' })
  account: CsvAccount;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'date', nullable: true })
  value_date: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  counterparty: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  transaction_type: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ref: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  debit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  credit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  balance: number;

  @Column({ type: 'boolean', default: false })
  is_charge: boolean;

  @Column({ type: 'int', nullable: true })
  parent_transaction_id: number;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true })
  fx_rate: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  fx_original_amount: number;

  @Column({ type: 'varchar', length: 10, nullable: true })
  fx_original_currency: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  bank_detected: string;

  @Column({ type: 'varchar', length: 50, default: 'manual' })
  source: string;

  @CreateDateColumn()
  created_at: Date;
}
