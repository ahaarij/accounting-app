import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { ExcelAccount } from './excel-account.entity';

@Entity('excel_transactions')
export class ExcelTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  account_id: number;

  @ManyToOne(() => ExcelAccount, a => a.transactions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'account_id' })
  account: ExcelAccount;

  @Column({ type: 'date', nullable: true })
  date: string;

  @Column({ type: 'text', nullable: true })
  particular: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  deposit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  withdrawal: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  balance: number;

  @Column({ type: 'varchar', length: 50, nullable: true })
  transaction_type: string;

  // User-assigned friendly name (set via suspense review)
  @Column({ type: 'varchar', length: 255, nullable: true })
  custom_label: string;

  @Column({ type: 'boolean', default: false })
  is_opening_balance: boolean;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  // Chronological position in the source sheet (0 = oldest row). Used as upsert key.
  @Column({ type: 'int', nullable: true })
  sheet_row_index: number | null;
}
