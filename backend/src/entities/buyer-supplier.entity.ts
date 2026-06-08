import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn,
  ManyToOne, JoinColumn, OneToMany,
} from 'typeorm';
import { CompanyProfile } from './company-profile.entity';
import { CompanyPartyLink } from './company-party-link.entity';

@Entity('buyers_suppliers')
export class BuyerSupplier {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 500 })
  name: string;

  @Column({ type: 'varchar', length: 10, default: 'buyer' })
  type: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ type: 'text', nullable: true })
  contact_info: string;

  @Column({ type: 'integer', nullable: true })
  linked_company_id: number;

  @ManyToOne(() => CompanyProfile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'linked_company_id' })
  linked_company: CompanyProfile;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;

  @OneToMany(() => CompanyPartyLink, (link) => link.party)
  company_links: CompanyPartyLink[];
}
