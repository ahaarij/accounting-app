import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('daily_cashflow')
export class DailyCashflow {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  transaction_group: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  amount_aed: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  amount_usd: number;

  @CreateDateColumn()
  created_at: Date;
}
