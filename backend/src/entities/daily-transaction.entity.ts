import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn } from 'typeorm';

@Entity('daily_transactions')
export class DailyTransaction {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', nullable: true })
  particulars: string;

  @Column({ type: 'varchar', nullable: true })
  source_bank: string;

  @Column({ type: 'varchar', nullable: true })
  beneficiary: string;

  @Column({ type: 'varchar', nullable: true })
  destination_bank: string;

  @Column({ type: 'varchar', nullable: true })
  remittance_ref: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  amount_aed: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  amount_usd: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  amount_eur: number;

  @Column({ type: 'varchar', nullable: true })
  pi_reference: string;

  @Column({ type: 'varchar', nullable: true })
  invoice_number: string;

  @Column({ type: 'varchar', nullable: true })
  transport_ref: string;

  @Column({ type: 'varchar', nullable: true })
  reference: string;

  @Column({ type: 'varchar', nullable: true })
  transaction_type: string;

  @CreateDateColumn()
  created_at: Date;
}
