import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { ExcelImport } from './excel-import.entity';
import { ExcelTransaction } from './excel-transaction.entity';

@Entity('excel_accounts')
export class ExcelAccount {
  @PrimaryGeneratedColumn()
  id: number;

  // Last import that touched this account; nullable because accounts survive import deletion
  @Column({ type: 'int', nullable: true })
  import_id: number | null;

  @ManyToOne(() => ExcelImport, i => i.accounts, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'import_id' })
  import: ExcelImport | null;

  // Group (A/B) stored directly so accounts are queryable without joining imports
  @Column({ type: 'char', length: 2, nullable: true })
  group: string;

  @Column({ type: 'varchar', length: 255 })
  sheet_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  bank_name: string;

  @Column({ type: 'varchar', length: 10, nullable: true })
  currency: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  account_code: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  remarks: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  closing_balance: number;

  @Column({ type: 'int', default: 0 })
  transaction_count: number;

  @Column({ type: 'int', default: 0 })
  sort_order: number;

  @OneToMany(() => ExcelTransaction, t => t.account)
  transactions: ExcelTransaction[];
}
