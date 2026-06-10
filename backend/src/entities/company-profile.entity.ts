import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { CompanyPartyLink } from './company-party-link.entity';

@Entity('company_profiles')
export class CompanyProfile {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'char', length: 1, nullable: true })
  category: string;

  @Column({ type: 'varchar', length: 500, unique: true })
  company_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  owner_name: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'numeric', precision: 15, scale: 2, nullable: true })
  turnover_aed: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  logo_path: string;

  @Column({ type: 'text', nullable: true })
  company_active_accounts: string;

  @Column({ type: 'text', nullable: true })
  personal_active_accounts: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country: string;

  @Column({ type: 'boolean', default: true })
  is_active: boolean;

  @Column({ type: 'text', nullable: true })
  contact_emails: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  contact_phone: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  industry: string;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => CompanyPartyLink, (link) => link.company, { cascade: true })
  party_links: CompanyPartyLink[];
}
