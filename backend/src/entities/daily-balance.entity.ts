import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('daily_balances')
export class DailyBalance {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  bank_account_id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  opening_balance: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  closing_balance: number;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 10 })
  file_source: string;

  @CreateDateColumn()
  created_at: Date;
}
