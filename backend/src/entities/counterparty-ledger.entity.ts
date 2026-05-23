import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('counterparty_ledger')
export class CounterpartyLedger {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 255 })
  counterparty_name: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  opening_balance_aed: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  opening_balance_usd: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  inward_fund: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  outward_fund: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  commission_aed: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  closing_balance_aed: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  closing_balance_usd: number;

  @Column({ type: 'varchar', nullable: true })
  status: string;

  @CreateDateColumn()
  created_at: Date;
}
