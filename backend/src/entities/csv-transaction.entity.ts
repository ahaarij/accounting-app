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

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  ref: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  debit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  credit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  balance: number;

  @CreateDateColumn()
  created_at: Date;
}
