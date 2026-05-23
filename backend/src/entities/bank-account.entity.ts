import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Company } from './company.entity';

@Entity('bank_accounts')
export class BankAccount {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => Company)
  @JoinColumn({ name: 'company_id' })
  company: Company;

  @Column({ type: 'int' })
  company_id: number;

  @Column({ type: 'varchar', length: 100 })
  bank_name: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  account_code: string;

  @Column({ type: 'varchar', length: 30, default: 'active' })
  status: string;

  @Column({ type: 'varchar', nullable: true })
  remarks: string;

  @CreateDateColumn()
  created_at: Date;
}
