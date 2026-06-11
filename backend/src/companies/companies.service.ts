import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyProfile } from '../entities/company-profile.entity';
import { BuyerSupplier } from '../entities/buyer-supplier.entity';
import { CompanyPartyLink } from '../entities/company-party-link.entity';

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(CompanyProfile) private profileRepo: Repository<CompanyProfile>,
    @InjectRepository(BuyerSupplier) private partyRepo: Repository<BuyerSupplier>,
    @InjectRepository(CompanyPartyLink) private linkRepo: Repository<CompanyPartyLink>,
  ) {}

  // ── Company Profiles ────────────────────────────────────────────────────────

  findAll() {
    return this.profileRepo
      .createQueryBuilder('cp')
      .orderBy(`CASE cp.category WHEN 'A' THEN 1 WHEN 'B' THEN 2 WHEN 'C' THEN 3 ELSE 4 END`, 'ASC')
      .addOrderBy('cp.company_name', 'ASC')
      .getMany();
  }

  async findOne(id: number) {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException(`Company profile ${id} not found`);

    const links = await this.linkRepo.find({
      where: { company_id: id },
      relations: ['party', 'party.linked_company'],
    });

    return {
      ...profile,
      suppliers: links.filter(l => l.relationship === 'supplier').map(l => ({ link_id: l.id, ...l.party })),
      buyers: links.filter(l => l.relationship === 'buyer').map(l => ({ link_id: l.id, ...l.party })),
    };
  }

  async create(dto: {
    category?: string; company_name: string; owner_name?: string;
    address?: string; turnover_aed?: number;
    company_active_accounts?: string; company_inactive_accounts?: string;
    personal_active_accounts?: string; personal_inactive_accounts?: string;
    country?: string; is_active?: boolean;
    contact_emails?: string; contact_phone?: string; industry?: string;
  }) {
    const existing = await this.profileRepo.findOne({ where: { company_name: dto.company_name } });
    if (existing) throw new ConflictException('Company name already exists');
    const profile = this.profileRepo.create(dto);
    return this.profileRepo.save(profile);
  }

  async update(id: number, dto: Partial<{
    category: string; company_name: string; owner_name: string;
    address: string; turnover_aed: number;
    company_active_accounts: string; company_inactive_accounts: string;
    personal_active_accounts: string; personal_inactive_accounts: string;
    country: string; is_active: boolean;
    contact_emails: string; contact_phone: string; industry: string;
  }>) {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException(`Company profile ${id} not found`);
    Object.assign(profile, dto);
    return this.profileRepo.save(profile);
  }

  async updateLogo(id: number, logoPath: string) {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException(`Company profile ${id} not found`);
    profile.logo_path = logoPath;
    return this.profileRepo.save(profile);
  }

  async remove(id: number) {
    const profile = await this.profileRepo.findOne({ where: { id } });
    if (!profile) throw new NotFoundException(`Company profile ${id} not found`);
    await this.profileRepo.remove(profile);
    return { deleted: true };
  }

  // ── Buyers / Suppliers ───────────────────────────────────────────────────────

  findAllParties() {
    return this.partyRepo.find({
      relations: ['linked_company'],
      order: { name: 'ASC' },
    });
  }

  async createParty(dto: {
    name: string; type?: string; address?: string;
    contact_info?: string; linked_company_id?: number;
  }) {
    const party = this.partyRepo.create(dto);
    return this.partyRepo.save(party);
  }

  async updateParty(id: number, dto: Partial<{
    name: string; type: string; address: string;
    contact_info: string; linked_company_id: number;
  }>) {
    const party = await this.partyRepo.findOne({ where: { id } });
    if (!party) throw new NotFoundException(`Party ${id} not found`);
    Object.assign(party, dto);
    return this.partyRepo.save(party);
  }

  async removeParty(id: number) {
    const party = await this.partyRepo.findOne({ where: { id } });
    if (!party) throw new NotFoundException(`Party ${id} not found`);
    await this.partyRepo.remove(party);
    return { deleted: true };
  }

  // ── Links ────────────────────────────────────────────────────────────────────

  async addLink(companyId: number, dto: { party_id: number; relationship: string }) {
    const existing = await this.linkRepo.findOne({
      where: { company_id: companyId, party_id: dto.party_id, relationship: dto.relationship },
    });
    if (existing) throw new ConflictException('Link already exists');
    const link = this.linkRepo.create({ company_id: companyId, ...dto });
    return this.linkRepo.save(link);
  }

  async removeLink(companyId: number, linkId: number) {
    const link = await this.linkRepo.findOne({ where: { id: linkId, company_id: companyId } });
    if (!link) throw new NotFoundException(`Link ${linkId} not found`);
    await this.linkRepo.remove(link);
    return { deleted: true };
  }
}
