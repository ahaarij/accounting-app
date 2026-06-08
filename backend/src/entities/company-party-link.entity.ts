import {
  Entity, PrimaryGeneratedColumn, Column,
  ManyToOne, JoinColumn,
} from 'typeorm';
import { CompanyProfile } from './company-profile.entity';
import { BuyerSupplier } from './buyer-supplier.entity';

@Entity('company_party_links')
export class CompanyPartyLink {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  company_id: number;

  @Column()
  party_id: number;

  @Column({ type: 'varchar', length: 10 })
  relationship: string;

  @ManyToOne(() => CompanyProfile, (profile) => profile.party_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'company_id' })
  company: CompanyProfile;

  @ManyToOne(() => BuyerSupplier, (bs) => bs.company_links, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'party_id' })
  party: BuyerSupplier;
}
