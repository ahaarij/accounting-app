import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('account_transactions')
export class AccountTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  bank_account_id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'text', nullable: true })
  particular: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  deposit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  withdrawal: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  running_balance: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', nullable: true })
  raw_sheet_name: string;

  @CreateDateColumn()
  created_at: Date;
}
