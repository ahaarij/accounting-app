import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('cash_entries')
export class CashEntry {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  cash_in: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  cash_out: number;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  balance: number;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'varchar', length: 10, default: 'AED' })
  currency: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
