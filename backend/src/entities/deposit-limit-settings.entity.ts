import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

@Entity('deposit_limit_settings')
export class DepositLimitSettings {
  @PrimaryColumn({ type: 'integer' })
  id: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  per_transaction_limit: number;

  @Column({ type: 'numeric', precision: 15, scale: 2 })
  monthly_limit: number;

  @UpdateDateColumn()
  updated_at: Date;
}
