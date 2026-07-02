import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { CsvAccount } from '../entities/csv-account.entity';
import { CsvTransaction } from '../entities/csv-transaction.entity';
import { toNumber } from '../import/utils/date.util';
import { PDFParse } from 'pdf-parse';
import { detectBank } from './parsers/bank-detector';
import { parseADIB } from './parsers/adib.parser';
import { parseFAB } from './parsers/fab.parser';
import { parseFABNew } from './parsers/fab-new.parser';
import { parseWio } from './parsers/wio.parser';
import { parseENBD } from './parsers/enbd.parser';
import { parseEIB } from './parsers/eib.parser';
import { parseNBF } from './parsers/nbf.parser';
import { parseMashreq } from './parsers/mashreq.parser';
import { parseUBL } from './parsers/ubl.parser';
import { parseADCB } from './parsers/adcb.parser';
import { parseRAKBANK } from './parsers/rakbank.parser';
import { ParsedStatement } from './parsers/types';

@Injectable()
export class BankStatementService {
  constructor(
    @InjectRepository(CsvAccount) private readonly accountRepo: Repository<CsvAccount>,
    @InjectRepository(CsvTransaction) private readonly txRepo: Repository<CsvTransaction>,
  ) {}

  // ── Account registry ──────────────────────────────────────────────────────

  async getAccounts(): Promise<CsvAccount[]> {
    return this.accountRepo.find({ order: { company_name: 'ASC' } });
  }

  async createAccount(dto: {
    account_number: string;
    company_name: string;
    currency: string;
    bank_name: string;
  }): Promise<CsvAccount> {
    const existing = await this.accountRepo.findOne({ where: { account_number: dto.account_number.trim() } });
    if (existing) throw new BadRequestException(`Account number ${dto.account_number} is already registered`);
    return this.accountRepo.save(this.accountRepo.create({
      account_number: dto.account_number.trim(),
      company_name: dto.company_name.trim(),
      currency: dto.currency.trim().toUpperCase(),
      bank_name: dto.bank_name.trim(),
    }));
  }

  async updateAccount(id: number, dto: Partial<{
    account_number: string;
    company_name: string;
    currency: string;
    bank_name: string;
  }>): Promise<CsvAccount> {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException(`Account #${id} not found`);
    Object.assign(account, dto);
    return this.accountRepo.save(account);
  }

  async deleteAccount(id: number): Promise<void> {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException(`Account #${id} not found`);
    await this.accountRepo.remove(account);
  }

  // ── CSV import ─────────────────────────────────────────────────────────────

  async importCSV(buffer: Buffer, filename: string, source = 'manual'): Promise<{
    account_number: string;
    company_name: string;
    imported: number;
    skipped: number;
  }> {
    const content = buffer.toString('utf-8').replace(/^﻿/, '');
    const lines = content.split(/\r?\n/);

    // Extract account info: prefer metadata embedded in file, fall back to filename
    const fileMeta = this.extractAccountFromFilename(filename);
    const sibMeta  = this.parseSIBMetadata(lines);

    // Use real account number from file metadata if present, otherwise generate from filename
    const accountNumber = sibMeta.accountNumber || fileMeta.accountNumber;
    const companyName   = fileMeta.companyName !== 'UNKNOWN' ? fileMeta.companyName : (sibMeta.accountNumber || 'UNKNOWN');
    const bankName      = fileMeta.bankName    !== 'UNKNOWN' ? fileMeta.bankName    : 'UNKNOWN';
    const currency      = fileMeta.currency;

    let csvAccount = await this.accountRepo.findOne({ where: { account_number: accountNumber } });
    if (!csvAccount) {
      csvAccount = await this.accountRepo.save(this.accountRepo.create({
        account_number: accountNumber,
        company_name:   companyName,
        bank_name:      bankName,
        currency,
        source,
        iban:   sibMeta.iban   || undefined,
        branch: sibMeta.branch || undefined,
      }));
    } else {
      if (!csvAccount.iban   && sibMeta.iban)   csvAccount.iban   = sibMeta.iban;
      if (!csvAccount.branch && sibMeta.branch) csvAccount.branch = sibMeta.branch;
      await this.accountRepo.save(csvAccount);
    }

    let transactions = this.parseGenericCSV(lines);
    if (transactions.length === 0) {
      // Fallback: try headerless SIB format (date,desc,ref,debit,credit,balance)
      transactions = this.parseSIBTransactions(lines);
    }
    if (transactions.length === 0) {
      throw new BadRequestException(
        `Could not find any transaction rows in this file. ` +
        `Make sure it has a header row containing columns like "Date", "Debit", "Credit", "Balance".`,
      );
    }

    let imported = 0;
    let skipped = 0;
    for (const tx of transactions) {
      const exists = await this.txRepo.findOne({
        where: {
          csv_account_id: csvAccount.id,
          date: tx.date,
          description: tx.description,
          debit: tx.debit,
          credit: tx.credit,
        },
      });
      if (exists) { skipped++; continue; }
      await this.txRepo.save(this.txRepo.create({
        csv_account_id: csvAccount.id,
        date: tx.date,
        description: tx.description,
        ref: tx.ref,
        debit: tx.debit,
        credit: tx.credit,
        balance: tx.balance,
        source,
      }));
      imported++;
    }

    return { account_number: csvAccount.account_number, company_name: csvAccount.company_name, imported, skipped };
  }

  // ── PDF password management ───────────────────────────────────────────────

  async setPdfPassword(id: number, password: string): Promise<CsvAccount> {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) throw new NotFoundException(`Account #${id} not found`);
    account.pdf_password = password || null;
    return this.accountRepo.save(account);
  }

  // ── PDF preview (text extraction only, no DB write) ──────────────────────

  async previewPDF(buffer: Buffer, passwordOverride?: string): Promise<{
    pages: number;
    text: string;
    lines: number;
    tables: Array<{ page: number; rows: string[][] }>;
  }> {
    const opts = (pwd?: string) => ({ data: buffer, ...(pwd ? { password: pwd } : {}) });

    const decrypt = async (pwd?: string) => {
      const parser = new PDFParse(opts(pwd));
      const [textResult, tableResult] = await Promise.all([
        parser.getText(),
        new PDFParse(opts(pwd)).getTable(),
      ]);
      return { textResult, tableResult };
    };

    let textResult: any;
    let tableResult: any;
    try {
      ({ textResult, tableResult } = await decrypt());
    } catch (e: any) {
      const isPasswordError = e?.name === 'PasswordException' || /password/i.test(e?.message ?? '');
      if (!isPasswordError) throw new BadRequestException(`Failed to read PDF: ${e?.message ?? 'unknown error'}`);
      if (!passwordOverride) throw new BadRequestException('This PDF is password-protected. Enter the password in the field above.');
      try {
        ({ textResult, tableResult } = await decrypt(passwordOverride));
      } catch {
        throw new BadRequestException('Incorrect password — could not decrypt this PDF.');
      }
    }

    // Flatten table structure: [{ page, rows: string[][] }]
    const tables: Array<{ page: number; rows: string[][] }> = [];
    for (const pg of (tableResult?.pages ?? [])) {
      for (const tbl of (pg.tables ?? [])) {
        if (tbl.length > 0) tables.push({ page: pg.num, rows: tbl });
      }
    }

    const text = textResult.text;
    return {
      pages: (textResult as any).total ?? 1,
      text,
      lines: text.split('\n').filter((l: string) => l.trim()).length,
      tables,
    };
  }

  // ── PDF import ─────────────────────────────────────────────────────────────

  async importPDF(buffer: Buffer, filename: string, _accountId?: number, passwordOverride?: string, source = 'pdf'): Promise<{
    bank: string;
    accounts: Array<{ account_number: string; company_name: string; imported: number; skipped: number; created: boolean }>;
    pages: number;
  }> {
    // Extract text from PDF
    const tryParse = async (pwd?: string) => {
      const parser = new PDFParse({ data: buffer, ...(pwd ? { password: pwd } : {}) });
      return parser.getText();
    };

    let textResult: any;
    try {
      textResult = await tryParse();
    } catch (e: any) {
      const isPasswordError = e?.name === 'PasswordException' || /password/i.test(e?.message ?? '');
      if (!isPasswordError) throw new BadRequestException(`Failed to read PDF: ${e?.message ?? 'unknown error'}`);
      if (!passwordOverride) throw new BadRequestException('This PDF is password-protected. Enter the password above.');
      try {
        textResult = await tryParse(passwordOverride);
      } catch {
        throw new BadRequestException('Incorrect PDF password.');
      }
    }

    const fullText: string = textResult.text;
    const numPages: number = (textResult as any).total ?? 1;
    const pages: string[] = fullText.split(/\f/).length > 1 ? fullText.split(/\f/) : [fullText];

    // Detect bank
    const bankCode = detectBank(fullText);
    if (!bankCode) {
      throw new BadRequestException(
        'Bank not supported — accepted banks: ADIB, FAB, FAB (new), Wio, ENBD, EIB, NBF, Mashreq, ADCB, RAKBANK.',
      );
    }

    // Parse with bank-specific parser
    let statement: ParsedStatement;
    switch (bankCode) {
      case 'ADIB':    statement = parseADIB(pages);    break;
      case 'FAB':     statement = parseFAB(pages);     break;
      case 'FAB_NEW': statement = parseFABNew(pages);  break;
      case 'WIO':     statement = parseWio(pages);     break;
      case 'ENBD':    statement = parseENBD(pages);    break;
      case 'EIB':     statement = parseEIB(pages);     break;
      case 'NBF':     statement = parseNBF(pages);     break;
      case 'MASHREQ': statement = parseMashreq(pages); break;
      case 'UBL':     statement = parseUBL(pages);     break;
      case 'ADCB':    statement = parseADCB(pages);    break;
      case 'RAKBANK': statement = parseRAKBANK(pages); break;
    }

    const results: Array<{ account_number: string; company_name: string; imported: number; skipped: number; created: boolean }> = [];

    for (const parsedAccount of statement.accounts) {
      // Find or create the csv_account
      let csvAccount = parsedAccount.iban
        ? await this.accountRepo.findOne({ where: { iban: parsedAccount.iban } })
        : null;

      if (!csvAccount && parsedAccount.account_number) {
        csvAccount = await this.accountRepo.findOne({ where: { account_number: parsedAccount.account_number } });
      }

      let created = false;
      if (!csvAccount) {
        csvAccount = await this.accountRepo.save(this.accountRepo.create({
          account_number: parsedAccount.account_number,
          company_name: parsedAccount.holder_name,
          bank_name: parsedAccount.bank_name,
          currency: parsedAccount.currency,
          iban: parsedAccount.iban || undefined,
          source,
        }));
        created = true;
      } else {
        // Update IBAN if we now have it
        if (parsedAccount.iban && !csvAccount.iban) {
          csvAccount.iban = parsedAccount.iban;
          await this.accountRepo.save(csvAccount);
        }
      }

      const parsedTxs = statement.transactions.get(parsedAccount.account_number) ?? [];

      // Separate parents and charges
      const parents = parsedTxs.filter(t => !t.is_charge);
      const charges = parsedTxs.filter(t => t.is_charge);

      let imported = 0;
      let skipped = 0;

      // Map charge_ref → saved parent id (for linking children)
      const refToParentId = new Map<string, number>();

      for (const tx of parents) {
        // Dedup check
        const exists = await this.txRepo.findOne({
          where: {
            csv_account_id: csvAccount.id,
            date: tx.date,
            ref: tx.reference ?? undefined,
            debit: tx.debit ?? undefined,
            credit: tx.credit ?? undefined,
          },
        });
        if (exists) {
          skipped++;
          if (tx.reference) refToParentId.set(tx.reference, exists.id);
          continue;
        }

        const saved = await this.txRepo.save(this.txRepo.create({
          csv_account_id: csvAccount.id,
          date: tx.date,
          value_date: tx.value_date ?? undefined,
          description: tx.narration,
          counterparty: tx.counterparty ?? undefined,
          transaction_type: tx.transaction_type,
          ref: tx.reference ?? undefined,
          debit: tx.debit ?? undefined,
          credit: tx.credit ?? undefined,
          balance: tx.running_balance ?? undefined,
          is_charge: false,
          fx_rate: tx.fx_rate ?? undefined,
          fx_original_amount: tx.fx_original_amount ?? undefined,
          fx_original_currency: tx.fx_original_currency ?? undefined,
          bank_detected: bankCode,
          source,
        }));
        imported++;
        if (tx.reference) refToParentId.set(tx.reference, saved.id);
      }

      for (const tx of charges) {
        const parentId = tx.charge_ref ? refToParentId.get(tx.charge_ref) : undefined;

        const exists = await this.txRepo.findOne({
          where: {
            csv_account_id: csvAccount.id,
            date: tx.date,
            ref: tx.reference ?? undefined,
            debit: tx.debit ?? undefined,
            credit: tx.credit ?? undefined,
          },
        });
        if (exists) { skipped++; continue; }

        await this.txRepo.save(this.txRepo.create({
          csv_account_id: csvAccount.id,
          date: tx.date,
          value_date: tx.value_date ?? undefined,
          description: tx.narration,
          counterparty: tx.counterparty ?? undefined,
          transaction_type: tx.transaction_type,
          ref: tx.reference ?? undefined,
          debit: tx.debit ?? undefined,
          credit: tx.credit ?? undefined,
          balance: tx.running_balance ?? undefined,
          is_charge: true,
          parent_transaction_id: parentId,
          bank_detected: bankCode,
          source,
        }));
        imported++;
      }

      results.push({
        account_number: csvAccount.account_number,
        company_name: csvAccount.company_name,
        imported,
        skipped,
        created,
      });
    }

    return { bank: bankCode, accounts: results, pages: numPages };
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransactions(accountId: number, page = 1, limit = 50, startDate?: string, endDate?: string): Promise<{
    account: CsvAccount;
    transactions: Array<CsvTransaction & { charges: CsvTransaction[] }>;
    total: number;
    page: number;
    pages: number;
  }> {
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account #${accountId} not found`);

    // Fetch only parent (top-level) transactions
    const qb = this.txRepo.createQueryBuilder('t')
      .where('t.csv_account_id = :accountId', { accountId })
      .andWhere('t.parent_transaction_id IS NULL')
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'ASC')
      .skip((page - 1) * limit)
      .take(limit);

    if (startDate) qb.andWhere('t.date >= :startDate', { startDate });
    if (endDate) qb.andWhere('t.date <= :endDate', { endDate });

    const [parents, total] = await qb.getManyAndCount();

    // Attach charge children
    let chargeMap = new Map<number, CsvTransaction[]>();
    if (parents.length > 0) {
      const parentIds = parents.map(p => p.id);
      const charges = await this.txRepo
        .createQueryBuilder('t')
        .where('t.parent_transaction_id IN (:...ids)', { ids: parentIds })
        .orderBy('t.id', 'ASC')
        .getMany();
      for (const c of charges) {
        const arr = chargeMap.get(c.parent_transaction_id!) ?? [];
        arr.push(c);
        chargeMap.set(c.parent_transaction_id!, arr);
      }
    }

    const transactions = parents.map(p => ({ ...p, charges: chargeMap.get(p.id) ?? [] }));
    return { account, transactions, total, page, pages: Math.ceil(total / limit) };
  }

  async getAccountsWithStats(startDate?: string, endDate?: string): Promise<Array<CsvAccount & { tx_count: number; latest_date: string; latest_balance: string }>> {
    const params: Record<string, string> = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;

    const joinParts = ['t.csv_account_id = a.id'];
    if (startDate) joinParts.push('t.date >= :startDate');
    if (endDate) joinParts.push('t.date <= :endDate');
    const dateJoinCondition = joinParts.join(' AND ');

    const balanceParts: string[] = [];
    if (startDate) balanceParts.push('t2.date >= :startDate');
    if (endDate) balanceParts.push('t2.date <= :endDate');
    const balanceWhere = balanceParts.length ? `AND ${balanceParts.join(' AND ')}` : '';

    const rows = await this.accountRepo
      .createQueryBuilder('a')
      .leftJoin('csv_transactions', 't', dateJoinCondition)
      .select('a.id', 'id')
      .addSelect('COUNT(t.id)', 'tx_count')
      .addSelect('MAX(t.date)', 'latest_date')
      .addSelect(
        `(SELECT t2.balance FROM csv_transactions t2 WHERE t2.csv_account_id = a.id ${balanceWhere} ORDER BY t2.date DESC, t2.id ASC LIMIT 1)`,
        'latest_balance',
      )
      .setParameters(params)
      .groupBy('a.id')
      .getRawMany();

    const accounts = await this.accountRepo.find({ order: { company_name: 'ASC' } });
    const statsMap = new Map(rows.map((r: any) => [r.id, r]));

    return accounts.map(a => {
      const s = statsMap.get(a.id) as any;
      return {
        ...a,
        tx_count: s ? parseInt(s.tx_count) : 0,
        latest_date: s?.latest_date ?? null,
        latest_balance: s?.latest_balance ?? null,
      } as any;
    });
  }

  async getCsvCompanyNames(): Promise<string[]> {
    const rows = await this.accountRepo
      .createQueryBuilder('a')
      .select('DISTINCT a.company_name', 'company_name')
      .orderBy('a.company_name', 'ASC')
      .getRawMany();
    return rows.map((r: any) => r.company_name).filter(Boolean);
  }

  async getCsvCompanyTransactions(
    search: string,
    currency?: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 200,
  ) {
    const qb = this.txRepo.createQueryBuilder('t')
      .innerJoin('csv_accounts', 'a', 'a.id = t.csv_account_id')
      .select([
        't.id          AS id',
        't.date        AS date',
        't.description AS description',
        't.ref         AS ref',
        't.debit       AS debit',
        't.credit      AS credit',
        't.balance     AS balance',
        'a.company_name AS account_name',
        'a.currency     AS currency',
        'a.bank_name    AS bank_name',
      ])
      .where('a.company_name ILIKE :pattern', { pattern: `%${search}%` })
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'ASC');

    if (currency) qb.andWhere('a.currency = :currency', { currency });
    if (startDate) qb.andWhere('t.date >= :startDate', { startDate });
    if (endDate) qb.andWhere('t.date <= :endDate', { endDate });

    const total = await qb.getCount();
    const rows = await qb.offset((page - 1) * limit).limit(limit).getRawMany();

    return { data: rows, total, page, pages: Math.ceil(total / limit) };
  }

  // ── Generic CSV parser ────────────────────────────────────────────────────

  // Parses the full CSV content respecting multi-line quoted cells
  private parseCSVRows(content: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let cell = '';
    let inQ = false;
    for (let i = 0; i < content.length; i++) {
      const ch = content[i], nx = content[i + 1];
      if (ch === '"') {
        if (inQ && nx === '"') { cell += '"'; i++; }
        else inQ = !inQ;
      } else if (ch === ',' && !inQ) {
        row.push(cell.trim()); cell = '';
      } else if ((ch === '\n' || (ch === '\r' && nx === '\n')) && !inQ) {
        if (ch === '\r') i++;
        row.push(cell.trim()); cell = '';
        if (row.some(c => c)) rows.push(row);
        row = [];
      } else {
        cell += ch;
      }
    }
    if (cell || row.length) { row.push(cell.trim()); if (row.some(c => c)) rows.push(row); }
    return rows;
  }

  // Strip Arabic / non-ASCII chars so bilingual headers match on the English word
  private toAscii(s: string): string {
    return s.replace(/[^\x00-\x7F]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  private parseGenericCSV(lines: string[]): TxRow[] {
    const content = lines.join('\n');
    const rows = this.parseCSVRows(content);

    const DATE_COLS   = /\bdate\b/i;
    const DESC_COLS   = /\b(description|narrative|particulars?|details?|remarks?)\b/i;
    const REF_COLS    = /\b(ref(erence)?|chq|cheque|transfer\s*ref)\b/i;
    const DEBIT_COLS  = /\b(debit|dr|withdrawal)\b/i;
    const CREDIT_COLS = /\b(credit|cr|deposit)\b/i;
    const BAL_COLS    = /\bbalance\b/i;

    let headerRowIdx = -1;
    const colMap: Record<string, number> = {};

    for (let i = 0; i < Math.min(rows.length, 30); i++) {
      const found: Record<string, number> = {};
      rows[i].forEach((raw, idx) => {
        const c = this.toAscii(raw);
        if (DATE_COLS.test(c))   found.date        = idx;
        if (DESC_COLS.test(c))   found.description = idx;
        if (REF_COLS.test(c))    found.ref         = idx;
        if (DEBIT_COLS.test(c))  found.debit       = idx;
        if (CREDIT_COLS.test(c)) found.credit      = idx;
        if (BAL_COLS.test(c))    found.balance     = idx;
      });
      if (found.date !== undefined && (found.debit !== undefined || found.credit !== undefined)) {
        headerRowIdx = i; Object.assign(colMap, found); break;
      }
    }

    if (headerRowIdx < 0) return [];

    const transactions: TxRow[] = [];
    for (let i = headerRowIdx + 1; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.length < 2) continue;

      const isoDate = this.parseAnyDate(cells[colMap.date] ?? '');
      if (!isoDate) continue;

      const rawNum = (v: string) => {
        const clean = v.replace(/,/g, '').replace(/'/g, '').trim();
        const n = parseFloat(clean);
        return isNaN(n) ? null : n;
      };

      const debitVal  = colMap.debit   !== undefined ? rawNum(cells[colMap.debit]  ?? '') : null;
      const creditVal = colMap.credit  !== undefined ? rawNum(cells[colMap.credit] ?? '') : null;
      const balVal    = colMap.balance !== undefined ? rawNum(cells[colMap.balance] ?? '') : null;

      // Some banks encode debits as negative numbers in the debit column
      const debit  = debitVal  != null && debitVal  !== 0 ? parseFloat(Math.abs(debitVal).toFixed(2))  : null;
      const credit = creditVal != null && creditVal !== 0 ? parseFloat(Math.abs(creditVal).toFixed(2)) : null;

      transactions.push({
        date:        isoDate,
        description: colMap.description !== undefined ? cells[colMap.description] || null : null,
        ref:         colMap.ref         !== undefined ? cells[colMap.ref]         || null : null,
        debit,
        credit,
        balance: balVal != null ? parseFloat(balVal.toFixed(2)) : null,
      });
    }
    return transactions;
  }

  private parseAnyDate(raw: string): string | null {
    const s = raw.replace(/[^\x00-\x7F]/g, '').replace(/^['"\s]+|['"\s]+$/g, '');
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return null;
  }

  // ── Format detection (kept for reference) ────────────────────────────────

  private detectCSVFormat(lines: string[]): 'adib' | 'sib' | 'unknown' {
    for (const line of lines) {
      const clean = line.replace(/^﻿/, '').trim();
      if (!clean) continue;
      if (/^Transaction Date/i.test(clean)) return 'adib';
      if (/^Account number,/i.test(clean) || /^IBAN,/i.test(clean)) return 'sib';
      // First non-empty line doesn't match either known header — unknown format
      return 'unknown';
    }
    return 'unknown';
  }

  // ── Filename-based account extraction (works for any bank) ────────────────

  private extractAccountFromFilename(filename: string): {
    accountNumber: string; companyName: string; bankName: string; currency: string;
  } {
    const BANKS = [
      'ADIB', 'SIB', 'RAKBANK', 'RAK', 'ENBD', 'FAB', 'NBF', 'MASHREQ',
      'WIO', 'NBAD', 'CITI', 'HSBC', 'DIB', 'UBL', 'EIB', 'ALMASRAF', 'CBD',
    ];
    const CURRENCIES = ['AED', 'USD', 'EUR'];

    // Strip extension and parenthetical notes like "(downloaded 2026-05-01)"
    const base = filename
      .replace(/\.[^.]+$/, '')
      .replace(/\([^)]*\)/g, '')
      .trim()
      .toUpperCase();

    const words = base.split(/\s+/).filter(Boolean);

    const bankIdx = words.findIndex(w => BANKS.includes(w));
    const bank = bankIdx >= 0 ? words[bankIdx] : 'UNKNOWN';
    const companyName = bankIdx > 0 ? words.slice(0, bankIdx).join(' ') : words[0] ?? 'UNKNOWN';

    let currency = 'AED';
    if (bankIdx >= 0 && bankIdx + 1 < words.length && CURRENCIES.includes(words[bankIdx + 1])) {
      currency = words[bankIdx + 1];
    } else {
      currency = words.find(w => CURRENCIES.includes(w)) ?? 'AED';
    }

    return {
      accountNumber: `${companyName.replace(/\s+/g, '_')}_${bank}_${currency}`,
      companyName,
      bankName: bank,
      currency,
    };
  }

  private parseADIBFormat(lines: string[]): TxRow[] {
    const transactions: TxRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || !/^\d{2}-\d{2}-\d{4}/.test(line)) continue;
      const fields = this.splitCSVLine(line);
      if (fields.length < 6) continue;

      // Columns: Transaction Date, Value Date, Narrative, Transaction Reference, Debit, Credit, Running Balance
      const dateParts = fields[0].trim().split('-'); // DD-MM-YYYY
      if (dateParts.length < 3) continue;
      const isoDate = `${dateParts[2]}-${dateParts[1].padStart(2, '0')}-${dateParts[0].padStart(2, '0')}`;

      const debitRaw  = toNumber(fields[4]?.trim() ?? '');
      const creditRaw = toNumber(fields[5]?.trim() ?? '');
      const balRaw    = toNumber(fields[6]?.trim() ?? '');

      transactions.push({
        date:        isoDate,
        description: fields[2]?.trim() || null,
        ref:         fields[3]?.trim() || null,
        debit:       (debitRaw  != null && debitRaw  > 0) ? parseFloat(debitRaw.toFixed(2))  : null,
        credit:      (creditRaw != null && creditRaw > 0) ? parseFloat(creditRaw.toFixed(2)) : null,
        balance:     balRaw != null ? parseFloat(balRaw.toFixed(2)) : null,
      });
    }
    return transactions;
  }

  // ── SIB format ────────────────────────────────────────────────────────────

  private parseSIBMetadata(lines: string[]): { accountNumber: string; iban: string; currency: string; branch: string } {
    let accountNumber = '';
    let iban = '';
    let currency = 'AED';
    let branch = '';
    for (const line of lines) {
      const t = line.trim();
      if (/^Account number,/i.test(t)) accountNumber = t.split(',').slice(1).join(',').trim();
      if (/^IBAN,/i.test(t))           iban          = t.split(',').slice(1).join(',').trim();
      if (/^Currency,/i.test(t))       currency      = t.split(',').slice(1).join(',').trim() || 'AED';
      if (/^Branch,/i.test(t))         branch        = t.split(',').slice(1).join(',').trim();
    }
    return { accountNumber, iban, currency, branch };
  }

  private parseSIBTransactions(lines: string[]): TxRow[] {
    const dateRe = /^\d{2}\/\d{2}\/\d{4},/;
    const transactions: TxRow[] = [];
    for (const line of lines) {
      if (!dateRe.test(line.trim())) continue;
      const fields = this.splitCSVLine(line.trim());
      if (fields.length < 5) continue;

      const [d, m, y] = fields[0].trim().split('/');
      const isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;

      const debitRaw  = toNumber(fields[3]?.trim() ?? '');
      const creditRaw = toNumber(fields[4]?.trim() ?? '');
      const balRaw    = toNumber(fields[5]?.trim() ?? '');

      transactions.push({
        date:        isoDate,
        description: fields[1]?.trim() || null,
        ref:         fields[2]?.trim() || null,
        debit:       debitRaw  != null ? parseFloat(Math.abs(debitRaw).toFixed(2))  : null,
        credit:      creditRaw != null ? parseFloat(Math.abs(creditRaw).toFixed(2)) : null,
        balance:     balRaw    != null ? parseFloat(balRaw.toFixed(2))              : null,
      });
    }
    return transactions;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  async deleteAllTransactions(): Promise<{ deleted: number }> {
    const result = await this.txRepo.query('DELETE FROM csv_transactions');
    return { deleted: result[1] ?? 0 };
  }

  async getBalanceTrend(days: number): Promise<Array<{ date: string; aed: number; usd: number }>> {
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceStr = since.toISOString().slice(0, 10);

    // For each account, take the last balance per day, then sum by currency per day
    const rows = await this.txRepo.query(`
      WITH daily_closing AS (
        SELECT DISTINCT ON (t.csv_account_id, t.date)
          t.date,
          t.balance,
          a.currency
        FROM csv_transactions t
        JOIN csv_accounts a ON a.id = t.csv_account_id
        WHERE t.date >= $1 AND t.balance IS NOT NULL
        ORDER BY t.csv_account_id, t.date, t.id DESC
      )
      SELECT
        date,
        SUM(CASE WHEN currency = 'AED' THEN balance ELSE 0 END) AS aed,
        SUM(CASE WHEN currency = 'USD' THEN balance ELSE 0 END) AS usd
      FROM daily_closing
      GROUP BY date
      ORDER BY date ASC
    `, [sinceStr]);

    return rows.map((r: any) => ({
      date: r.date instanceof Date ? r.date.toISOString().slice(0, 10) : String(r.date).slice(0, 10),
      aed: parseFloat(r.aed) || 0,
      usd: parseFloat(r.usd) || 0,
    }));
  }

  private splitCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current);
    return result;
  }
}

type TxRow = {
  date: string;
  description: string | null;
  ref: string | null;
  debit: number | null;
  credit: number | null;
  balance: number | null;
};
