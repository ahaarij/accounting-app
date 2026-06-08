import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CompanyCashDeposit } from '../entities/company-cash-deposit.entity';
import { CompanyDepositLimit } from '../entities/company-deposit-limit.entity';
import { CompanyProfile } from '../entities/company-profile.entity';

const DEFAULT_PER_TX = 250000;
const DEFAULT_MONTHLY = 500000;

function parseAccounts(csv: string | null): string[] {
  if (!csv || !csv.trim()) return [];
  return csv.split(',').map((a) => a.trim()).filter((a) => a.length > 0);
}

function rowKey(companyId: number, bankAccount: string | null): string {
  return `${companyId}:${bankAccount ?? '__none__'}`;
}

@Injectable()
export class CashDepositsService {
  constructor(
    @InjectRepository(CompanyCashDeposit)
    private readonly depositRepo: Repository<CompanyCashDeposit>,
    @InjectRepository(CompanyDepositLimit)
    private readonly limitRepo: Repository<CompanyDepositLimit>,
    @InjectRepository(CompanyProfile)
    private readonly companyRepo: Repository<CompanyProfile>,
  ) {}

  async getDeposits(from: string, to: string) {
    const [companies, deposits, limits] = await Promise.all([
      this.companyRepo.find({ order: { company_name: 'ASC' } }),
      this.depositRepo
        .createQueryBuilder('d')
        .where('d.date >= :from AND d.date <= :to', { from, to })
        .orderBy('d.company_id', 'ASC')
        .addOrderBy('d.bank_account', 'ASC')
        .addOrderBy('d.date', 'ASC')
        .addOrderBy('d.id', 'ASC')
        .getMany(),
      this.limitRepo.find(),
    ]);

    const depositsByKey = new Map<string, CompanyCashDeposit[]>();
    for (const d of deposits) {
      const k = rowKey(d.company_id, d.bank_account);
      if (!depositsByKey.has(k)) depositsByKey.set(k, []);
      depositsByKey.get(k)!.push(d);
    }

    const limitsByKey = new Map<string, CompanyDepositLimit>();
    for (const l of limits) {
      limitsByKey.set(rowKey(l.company_id, l.bank_account), l);
    }

    const rows: object[] = [];

    for (const company of companies) {
      const companyAccounts = parseAccounts(company.company_active_accounts);
      const personalAccounts = parseAccounts(company.personal_active_accounts);
      const allAccounts = [...companyAccounts, ...personalAccounts];
      const accountList = allAccounts.length > 0 ? allAccounts : [null];

      for (const account of accountList) {
        const k = rowKey(company.id, account);
        const accountDeposits = depositsByKey.get(k) || [];
        const lim = limitsByKey.get(k);
        const per_tx_limit = lim ? parseFloat(lim.per_tx_limit as any) : DEFAULT_PER_TX;
        const monthly_limit = lim ? parseFloat(lim.monthly_limit as any) : DEFAULT_MONTHLY;

        let running = 0;
        const depositsOut = accountDeposits.map((d) => {
          running += parseFloat(d.amount as any);
          return {
            id: d.id,
            date: d.date,
            description: d.description,
            amount: parseFloat(d.amount as any),
            currency: d.currency,
            running_total: parseFloat(running.toFixed(2)),
          };
        });

        rows.push({
          company_id: company.id,
          bank_account: account,
          category: company.category,
          company_name: company.company_name,
          owner_name: company.owner_name,
          total_deposits: parseFloat(running.toFixed(2)),
          deposits: depositsOut,
          per_tx_limit,
          monthly_limit,
        });
      }
    }

    return { rows };
  }

  async createDeposit(dto: {
    company_id: number;
    bank_account: string | null;
    date: string;
    description: string;
    amount: number;
    currency?: string;
  }) {
    const deposit = this.depositRepo.create({
      company_id: dto.company_id,
      bank_account: dto.bank_account,
      date: dto.date,
      description: dto.description,
      amount: dto.amount,
      currency: dto.currency || 'AED',
    });
    return this.depositRepo.save(deposit);
  }

  async updateDeposit(id: number, dto: { date?: string; description?: string; amount?: number }) {
    const deposit = await this.depositRepo.findOne({ where: { id } });
    if (!deposit) throw new NotFoundException(`Deposit ${id} not found`);
    Object.assign(deposit, dto);
    return this.depositRepo.save(deposit);
  }

  async deleteDeposit(id: number) {
    const deposit = await this.depositRepo.findOne({ where: { id } });
    if (!deposit) throw new NotFoundException(`Deposit ${id} not found`);
    await this.depositRepo.remove(deposit);
    return { success: true };
  }

  async updateCompanyLimits(
    companyId: number,
    bankAccount: string,
    dto: { per_tx_limit?: number; monthly_limit?: number },
  ) {
    let lim = await this.limitRepo.findOne({ where: { company_id: companyId, bank_account: bankAccount } });
    if (!lim) {
      lim = this.limitRepo.create({ company_id: companyId, bank_account: bankAccount, per_tx_limit: DEFAULT_PER_TX, monthly_limit: DEFAULT_MONTHLY });
    }
    if (dto.per_tx_limit !== undefined) lim.per_tx_limit = dto.per_tx_limit;
    if (dto.monthly_limit !== undefined) lim.monthly_limit = dto.monthly_limit;
    return this.limitRepo.save(lim);
  }
}
