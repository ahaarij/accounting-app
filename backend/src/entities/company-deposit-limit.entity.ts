import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('company_deposit_limits')
export class CompanyDepositLimit {
  @PrimaryColumn({ type: 'integer' })
  company_id: number;

  @PrimaryColumn({ type: 'varchar', length: 100 })
  bank_account: string;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  per_tx_limit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  monthly_limit: number;

  @UpdateDateColumn()
  updated_at: Date;
}
