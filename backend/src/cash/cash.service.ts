import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CashEntry } from '../entities/cash-entry.entity';
import { DailyCashflow } from '../entities/daily-cashflow.entity';

@Injectable()
export class CashService {
  constructor(
    @InjectRepository(CashEntry) private readonly repo: Repository<CashEntry>,
    @InjectRepository(DailyCashflow) private readonly cashflowRepo: Repository<DailyCashflow>,
  ) {}

  async getEntries(currency?: string, startDate?: string, endDate?: string): Promise<CashEntry[]> {
    const qb = this.repo.createQueryBuilder('e').orderBy('e.date', 'ASC').addOrderBy('e.id', 'ASC');
    if (currency) qb.andWhere('e.currency = :currency', { currency });
    if (startDate) qb.andWhere('e.date >= :startDate', { startDate });
    if (endDate) qb.andWhere('e.date <= :endDate', { endDate });
    return qb.getMany();
  }

  async createEntry(dto: {
    date: string; description?: string; cash_in?: number; cash_out?: number;
    balance?: number; notes?: string; currency?: string;
  }): Promise<CashEntry> {
    return this.repo.save(this.repo.create({
      date: dto.date,
      description: dto.description ?? null,
      cash_in: dto.cash_in ?? null,
      cash_out: dto.cash_out ?? null,
      balance: dto.balance ?? null,
      notes: dto.notes ?? null,
      currency: dto.currency ?? 'AED',
    }));
  }

  async updateEntry(id: number, dto: Partial<{
    date: string; description: string; cash_in: number; cash_out: number;
    balance: number; notes: string; currency: string;
  }>): Promise<CashEntry> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`Cash entry #${id} not found`);
    Object.assign(entry, dto);
    return this.repo.save(entry);
  }

  async deleteEntry(id: number): Promise<void> {
    const entry = await this.repo.findOne({ where: { id } });
    if (!entry) throw new NotFoundException(`Cash entry #${id} not found`);
    await this.repo.remove(entry);
  }

  async deleteCashflowRow(id: number): Promise<void> {
    const row = await this.cashflowRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException(`Cashflow row #${id} not found`);
    await this.cashflowRepo.remove(row);
  }

  async clearAllCashflow(): Promise<{ deleted: number }> {
    const result = await this.cashflowRepo.query('DELETE FROM daily_cashflow');
    return { deleted: result[1] ?? 0 };
  }

  async getCashflowSummary(startDate?: string, endDate?: string) {
    const dateWhere = [
      startDate ? `date >= '${startDate}'` : null,
      endDate   ? `date <= '${endDate}'`   : null,
    ].filter(Boolean).join(' AND ');
    const where = dateWhere ? `WHERE ${dateWhere}` : '';

    const cashflow = await this.repo.query(`
      SELECT id, date, transaction_group, amount_aed, amount_usd
      FROM daily_cashflow ${where}
      ORDER BY date ASC, id ASC
    `);

    return { cashflow };
  }
}
