import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';
import { GroupAParser } from './parsers/group-a.parser';
import { GroupBParser } from './parsers/group-b.parser';
import { TransactionParser } from './parsers/transaction.parser';
import { CashflowParser } from './parsers/cashflow.parser';
import { Company } from '../entities/company.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { DailyBalance } from '../entities/daily-balance.entity';
import { AccountTransaction } from '../entities/account-transaction.entity';
import { DailyTransaction } from '../entities/daily-transaction.entity';
import { DailyCashflow } from '../entities/daily-cashflow.entity';
import { CounterpartyLedger } from '../entities/counterparty-ledger.entity';
import { ImportLog } from '../entities/import-log.entity';
import { ReconciliationService } from '../reconciliation/reconciliation.service';

function mapStatus(remarks: string | null): string {
  if (!remarks) return 'active';
  const r = remarks.toUpperCase();
  if (r.includes('BLOCKED')) return 'blocked';
  if (r.includes('KYC')) return 'kyc_issue';
  if (r.includes('NOT WORKING')) return 'not_working';
  if (r.includes('ONLINE ISSUE')) return 'online_issue';
  if (r.includes('DISABLED')) return 'disabled';
  if (r.includes('CLOSED')) return 'closed';
  if (r === 'NA' || r === 'N/A') return 'na';
  return 'active';
}

@Injectable()
export class ImportService {
  private readonly logger = new Logger(ImportService.name);

  constructor(
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(BankAccount) private bankAccountRepo: Repository<BankAccount>,
    @InjectRepository(DailyBalance) private dailyBalanceRepo: Repository<DailyBalance>,
    @InjectRepository(AccountTransaction) private accountTxRepo: Repository<AccountTransaction>,
    @InjectRepository(DailyTransaction) private dailyTxRepo: Repository<DailyTransaction>,
    @InjectRepository(DailyCashflow) private cashflowRepo: Repository<DailyCashflow>,
    @InjectRepository(CounterpartyLedger) private counterpartyRepo: Repository<CounterpartyLedger>,
    @InjectRepository(ImportLog) private importLogRepo: Repository<ImportLog>,
    private dataSource: DataSource,
    private groupAParser: GroupAParser,
    private groupBParser: GroupBParser,
    private transactionParser: TransactionParser,
    private cashflowParser: CashflowParser,
    @Inject(forwardRef(() => ReconciliationService)) private reconciliationService: ReconciliationService,
  ) {}

  async importGroupA(filePath: string, filename: string): Promise<{ records: number; errors: string[] }> {
    const errors: string[] = [];
    let records = 0;
    const today = new Date().toISOString().substring(0, 10);

    try {
      const { summary, accounts } = this.groupAParser.parse(filePath);
      this.logger.log(`GroupA: ${accounts.length} sheets, ${summary.length} summary rows`);

      // Build lookup: company_name → { account_code, remarks } from SUMMARY sheet
      const summaryMapA = new Map<string, { account_code: string | null; remarks: string | null }>();
      for (const row of summary) {
        if (row.company_name) summaryMapA.set(row.company_name.trim().toUpperCase(), { account_code: row.account_code, remarks: row.remarks });
      }

      for (const sheet of accounts) {
        const summaryInfo = sheet.company_name ? summaryMapA.get(sheet.company_name.trim().toUpperCase()) : null;
        const bankAccount = await this.upsertBankAccount(
          sheet.company_name, sheet.bank_name, sheet.currency, 'A',
          summaryInfo?.remarks ?? null, summaryInfo?.account_code ?? null,
        );
        if (!bankAccount) continue;

        for (let ti = 0; ti < sheet.transactions.length; ti++) {
          const tx = sheet.transactions[ti];
          if (tx.deposit == null && tx.withdrawal == null) continue;
          // For undated rows use the next dated transaction's date so the row stays in sheet order
          const resolvedDate = tx.date ??
            sheet.transactions.slice(ti + 1).find(t => t.date)?.date ??
            sheet.transactions.slice(0, ti).reverse().find(t => t.date)?.date ??
            today;
          const resolvedParticular = tx.particular ?? 'No Particulars Specified';
          if (!tx.date) errors.push(`[${sheet.sheet_name}] No Date Specified for row: ${resolvedParticular} (deposit: ${tx.deposit}, withdrawal: ${tx.withdrawal}) — used ${resolvedDate}`);
          if (!tx.particular) errors.push(`[${sheet.sheet_name}] No Particulars Specified on ${resolvedDate} (deposit: ${tx.deposit}, withdrawal: ${tx.withdrawal})`);
          const exists = await this.accountTxRepo.findOne({
            where: {
              bank_account_id: bankAccount.id,
              date: resolvedDate,
              particular: resolvedParticular,
              deposit: tx.deposit,
              withdrawal: tx.withdrawal,
              running_balance: tx.running_balance,
            },
          });
          if (exists) continue;
          await this.accountTxRepo.save(this.accountTxRepo.create({
            bank_account_id: bankAccount.id,
            date: resolvedDate,
            particular: resolvedParticular,
            deposit: tx.deposit,
            withdrawal: tx.withdrawal,
            running_balance: tx.running_balance,
            currency: sheet.currency || 'AED',
            raw_sheet_name: sheet.sheet_name,
          }));
          records++;
        }

        // Save opening + closing balance from account sheet transactions
        const datedTxs = sheet.transactions.filter(t => t.date);
        if (datedTxs.length > 0) {
          const last = datedTxs[datedTxs.length - 1];
          if (last.date && last.running_balance != null) {
            const existing = await this.dailyBalanceRepo.findOne({
              where: { bank_account_id: bankAccount.id, date: last.date },
            });
            if (!existing) {
              await this.dailyBalanceRepo.save(this.dailyBalanceRepo.create({
                bank_account_id: bankAccount.id,
                date: last.date,
                opening_balance: sheet.opening_balance,
                closing_balance: last.running_balance,
                currency: sheet.currency || 'AED',
                file_source: 'group_a',
              }));
            }
          }
        }
      }

      await this.logImport(today, 'group_a', filename, 'success', records, []);
      await this.reconciliationService.runAll(today);
    } catch (e) {
      errors.push(String(e));
      await this.logImport(today, 'group_a', filename, 'failed', records, errors);
    }
    return { records, errors };
  }

  async importGroupB(filePath: string, filename: string): Promise<{ records: number; errors: string[] }> {
    const errors: string[] = [];
    let records = 0;
    const today = new Date().toISOString().substring(0, 10);
    try {
      const { summary, accounts } = this.groupBParser.parse(filePath);
      this.logger.log(`GroupB: ${accounts.length} sheets, ${summary.length} summary rows`);

      const summaryMapB = new Map<string, { account_code: string | null; remarks: string | null }>();
      for (const row of summary) {
        if (row.company_name) summaryMapB.set(row.company_name.trim().toUpperCase(), { account_code: row.account_code, remarks: row.remarks });
      }

      for (const sheet of accounts) {
        const summaryInfo = sheet.company_name ? summaryMapB.get(sheet.company_name.trim().toUpperCase()) : null;
        const bankAccount = await this.upsertBankAccount(
          sheet.company_name, sheet.bank_name, sheet.currency, 'B',
          summaryInfo?.remarks ?? null, summaryInfo?.account_code ?? null,
        );
        if (!bankAccount) continue;
        for (let ti = 0; ti < sheet.transactions.length; ti++) {
          const tx = sheet.transactions[ti];
          if (tx.deposit == null && tx.withdrawal == null) continue;
          const resolvedDate = tx.date ??
            sheet.transactions.slice(ti + 1).find(t => t.date)?.date ??
            sheet.transactions.slice(0, ti).reverse().find(t => t.date)?.date ??
            today;
          const resolvedParticular = tx.particular ?? 'No Particulars Specified';
          if (!tx.date) errors.push(`[${sheet.sheet_name}] No Date Specified for row: ${resolvedParticular} (deposit: ${tx.deposit}, withdrawal: ${tx.withdrawal}) — used ${resolvedDate}`);
          if (!tx.particular) errors.push(`[${sheet.sheet_name}] No Particulars Specified on ${resolvedDate} (deposit: ${tx.deposit}, withdrawal: ${tx.withdrawal})`);
          const exists = await this.accountTxRepo.findOne({
            where: {
              bank_account_id: bankAccount.id,
              date: resolvedDate,
              particular: resolvedParticular,
              deposit: tx.deposit,
              withdrawal: tx.withdrawal,
              running_balance: tx.running_balance,
            },
          });
          if (exists) continue;
          await this.accountTxRepo.save(this.accountTxRepo.create({
            bank_account_id: bankAccount.id,
            date: resolvedDate,
            particular: resolvedParticular,
            deposit: tx.deposit,
            withdrawal: tx.withdrawal,
            running_balance: tx.running_balance,
            currency: sheet.currency || 'AED',
            raw_sheet_name: sheet.sheet_name,
          }));
          records++;
        }
      }
      await this.logImport(today, 'group_b', filename, 'success', records, []);
      await this.reconciliationService.runAll(today);
    } catch (e) {
      errors.push(String(e));
      await this.logImport(today, 'group_b', filename, 'failed', records, errors);
    }
    return { records, errors };
  }

  async importTransactions(filePath: string, filename: string): Promise<{ records: number; errors: string[] }> {
    const errors: string[] = [];
    let records = 0;
    const today = new Date().toISOString().substring(0, 10);
    try {
      const rows = this.transactionParser.parse(filePath);
      this.logger.log(`Transactions: ${rows.length} rows`);
      for (const row of rows) {
        if (!row.date) continue;
        const exists = await this.dailyTxRepo.findOne({
          where: {
            date: row.date,
            particulars: row.particulars,
            source_bank: row.source_bank,
            amount_aed: row.amount_aed,
            amount_usd: row.amount_usd,
          },
        });
        if (exists) continue;
        await this.dailyTxRepo.save(this.dailyTxRepo.create({
          date: row.date,
          particulars: row.particulars,
          source_bank: row.source_bank,
          beneficiary: row.beneficiary,
          destination_bank: row.destination_bank,
          remittance_ref: row.remittance_ref,
          amount_aed: row.amount_aed,
          amount_usd: row.amount_usd,
          amount_eur: row.amount_eur,
          pi_reference: row.pi_reference,
          invoice_number: row.invoice_number,
          transport_ref: row.transport_ref,
          reference: row.reference,
          transaction_type: row.transaction_type,
        }));
        records++;
      }
      await this.logImport(today, 'transactions', filename, 'success', records, []);
    } catch (e) {
      errors.push(String(e));
      await this.logImport(today, 'transactions', filename, 'failed', records, errors);
    }
    return { records, errors };
  }

  async importCashflow(filePath: string, filename: string): Promise<{ records: number; errors: string[] }> {
    const errors: string[] = [];
    let records = 0;
    const today = new Date().toISOString().substring(0, 10);
    try {
      const { cashflow, counterparties } = this.cashflowParser.parse(filePath);
      this.logger.log(`Cashflow: ${cashflow.length} rows, ${counterparties.length} counterparties`);
      for (const row of cashflow) {
        const exists = await this.cashflowRepo.findOne({
          where: { date: row.date, transaction_group: row.transaction_group },
        });
        if (exists) continue;
        await this.cashflowRepo.save(this.cashflowRepo.create(row));
        records++;
      }
      for (const row of counterparties) {
        const exists = await this.counterpartyRepo.findOne({
          where: { date: row.date, counterparty_name: row.counterparty_name },
        });
        if (exists) continue;
        await this.counterpartyRepo.save(this.counterpartyRepo.create(row));
        records++;
      }
      await this.logImport(today, 'cashflow', filename, 'success', records, []);
    } catch (e) {
      errors.push(String(e));
      await this.logImport(today, 'cashflow', filename, 'failed', records, errors);
    }
    return { records, errors };
  }

  private async upsertBankAccount(
    companyName: string | null,
    bankName: string | null,
    currency: string | null,
    group: string,
    remarks: string | null,
    account_code: string | null = null,
  ): Promise<BankAccount | null> {
    if (!companyName) return null;
    let company = await this.companyRepo.findOne({ where: { name: companyName, group } });
    if (!company) {
      company = await this.companyRepo.save(this.companyRepo.create({ name: companyName, group }));
    }
    const curr = currency || 'AED';
    const bank = bankName || 'UNKNOWN';
    let account = await this.bankAccountRepo.findOne({
      where: { company_id: company.id, bank_name: bank, currency: curr },
    });
    if (!account) {
      account = await this.bankAccountRepo.save(this.bankAccountRepo.create({
        company_id: company.id,
        bank_name: bank,
        currency: curr,
        account_code,
        status: mapStatus(remarks),
        remarks,
      }));
    } else if (account_code && !account.account_code) {
      account.account_code = account_code;
      await this.bankAccountRepo.save(account);
    }
    return account;
  }

  async resetDatabase(): Promise<{ message: string }> {
    await this.dataSource.query(`
      TRUNCATE TABLE
        reconciliation_flags,
        reconciliation_results,
        account_transactions,
        daily_transactions,
        counterparty_ledger,
        daily_cashflow,
        daily_balances,
        import_log,
        bank_accounts,
        companies,
        sales_invoices
      RESTART IDENTITY CASCADE
    `);
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      for (const file of fs.readdirSync(uploadsDir)) {
        fs.unlinkSync(path.join(uploadsDir, file));
      }
    }
    this.logger.log('Database wiped and uploads cleared by admin reset');
    return { message: 'Database cleared successfully' };
  }

  private async logImport(
    date: string,
    fileType: string,
    filename: string,
    status: string,
    records: number,
    errors: string[],
  ): Promise<void> {
    await this.importLogRepo.save(this.importLogRepo.create({
      date,
      file_type: fileType,
      filename,
      status,
      records_imported: records,
      errors: errors.length ? errors : null,
    }));
  }
}
