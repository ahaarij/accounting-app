import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CsvAccount } from '../entities/csv-account.entity';
import { CsvTransaction } from '../entities/csv-transaction.entity';
import { toNumber } from '../import/utils/date.util';
import { PDFParse } from 'pdf-parse';

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

  async importPDF(buffer: Buffer, filename: string, accountId?: number, passwordOverride?: string, source = 'pdf'): Promise<{
    account_number: string;
    company_name: string;
    imported: number;
    skipped: number;
    pages: number;
  }> {
    // Resolve account — explicit ID wins, else derive from filename
    let csvAccount: CsvAccount | null = null;
    if (accountId) {
      csvAccount = await this.accountRepo.findOne({ where: { id: accountId } });
      if (!csvAccount) throw new NotFoundException(`Account #${accountId} not found`);
    } else {
      const fileMeta = this.extractAccountFromFilename(filename.replace(/\.pdf$/i, '.csv'));
      csvAccount = await this.accountRepo.findOne({ where: { account_number: fileMeta.accountNumber } });
      if (!csvAccount) {
        // Auto-create account from filename
        csvAccount = await this.accountRepo.save(this.accountRepo.create({
          account_number: fileMeta.accountNumber,
          company_name: fileMeta.companyName,
          bank_name: fileMeta.bankName,
          currency: fileMeta.currency,
          source,
        }));
      }
    }

    // Decrypt and extract text — try without password first, fall back to stored/override password
    let pdfText: string;
    let numPages: number;

    const tryParse = async (pwd?: string) => {
      const parser = new PDFParse({ data: buffer, ...(pwd ? { password: pwd } : {}) });
      const result = await parser.getText();
      return result;
    };

    try {
      // Attempt 1: no password (works for unprotected PDFs)
      const result = await tryParse();
      pdfText = result.text;
      numPages = (result as any).total ?? 1;
    } catch (e: any) {
      const isPasswordError = e?.name === 'PasswordException' || /password/i.test(e?.message ?? '');
      if (!isPasswordError) {
        throw new BadRequestException(`Failed to read PDF: ${e?.message ?? 'unknown error'}`);
      }
      // Attempt 2: use stored password or override
      const password = passwordOverride || csvAccount.pdf_password;
      if (!password) {
        throw new BadRequestException(
          `This PDF is password-protected. Set a PDF password for "${csvAccount.company_name}" in the Account Registry first.`,
        );
      }
      try {
        const result = await tryParse(password);
        pdfText = result.text;
        numPages = (result as any).total ?? 1;
      } catch {
        throw new BadRequestException(
          `Incorrect PDF password for "${csvAccount.company_name}". Update it in the Account Registry.`,
        );
      }
    }

    // Parse transactions from extracted text
    const lines = pdfText.split('\n').map(l => l.trim()).filter(Boolean);
    const transactions = this.parsePdfTransactions(lines);

    if (transactions.length === 0) {
      return {
        account_number: csvAccount.account_number,
        company_name: csvAccount.company_name,
        imported: 0,
        skipped: 0,
        pages: numPages,
        preview_text: pdfText.substring(0, 3000),
        warning: 'No transaction rows detected. The extracted text is shown below so you can verify the layout.',
      } as any;
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

    return {
      account_number: csvAccount.account_number,
      company_name: csvAccount.company_name,
      imported,
      skipped,
      pages: numPages,
    };
  }

  // Parse transactions from PDF text lines (handles most common bank PDF layouts)
  private parsePdfTransactions(lines: string[]): TxRow[] {
    // Strategy 1: find a header row then parse columnar data
    const DATE_HDR   = /\bdate\b/i;
    const DESC_HDR   = /\b(description|narrative|particulars?|details?|remarks?|narration)\b/i;
    const DEBIT_HDR  = /\b(debit|dr|withdrawal|out)\b/i;
    const CREDIT_HDR = /\b(credit|cr|deposit|in)\b/i;
    const BAL_HDR    = /\b(balance|bal)\b/i;
    const REF_HDR    = /\b(ref(erence)?|chq|cheque)\b/i;

    // Try to find header row
    let headerIdx = -1;
    for (let i = 0; i < Math.min(lines.length, 30); i++) {
      const l = lines[i];
      if (DATE_HDR.test(l) && (DEBIT_HDR.test(l) || CREDIT_HDR.test(l))) {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx >= 0) {
      const columnar = this.parsePdfColumnar(lines, headerIdx);
      if (columnar.length > 0) return columnar;
      // Columnar split failed (columns not separated by 2+ spaces in extracted text) — fall through
    }

    // Strategy 2: date-anchored rows — scan for lines starting with a date
    const transactions: TxRow[] = [];
    const DATE_START = /^(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4}|\d{4}-\d{2}-\d{2})/;
    const NUM_RE = /[\d,]+\.?\d*/g;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (!DATE_START.test(l)) continue;

      const isoDate = this.parseAnyDate(l.split(/\s+/)[0]);
      if (!isoDate) continue;

      // Collect all numbers on this line (and optionally the next)
      const restOfLine = l.replace(/^\S+\s*/, '');
      const nums = (restOfLine.match(NUM_RE) || []).map(n => parseFloat(n.replace(/,/g, ''))).filter(n => !isNaN(n));

      // Heuristic: last number is balance, second-last is debit or credit
      let debit: number | null = null;
      let credit: number | null = null;
      let balance: number | null = null;

      if (nums.length >= 2) {
        balance = nums[nums.length - 1];
        const prev = nums[nums.length - 2];
        // If there are 3+ numbers, try debit/credit split
        if (nums.length >= 3) {
          debit  = nums[nums.length - 3] || null;
          credit = nums[nums.length - 2] || null;
        } else {
          credit = prev;
        }
      }

      const words = restOfLine.split(/\s+/);
      const descWords = words.filter(w => !/^[\d,]+\.?\d*$/.test(w));
      const description = descWords.join(' ').trim() || null;

      transactions.push({ date: isoDate, description, ref: null, debit, credit, balance });
    }

    return transactions;
  }

  private parsePdfColumnar(lines: string[], headerIdx: number): TxRow[] {
    const header = lines[headerIdx];
    // Build rough column positions from token positions in header
    const tokens = header.split(/\s{2,}/).map(t => t.trim()).filter(Boolean);

    const DATE_COL   = tokens.findIndex(t => /\bdate\b/i.test(t));
    const DESC_COL   = tokens.findIndex(t => /\b(description|narrative|particulars?|details?|narration)\b/i.test(t));
    const REF_COL    = tokens.findIndex(t => /\b(ref(erence)?|chq|cheque)\b/i.test(t));
    const DEBIT_COL  = tokens.findIndex(t => /\b(debit|dr|withdrawal)\b/i.test(t));
    const CREDIT_COL = tokens.findIndex(t => /\b(credit|cr|deposit)\b/i.test(t));
    const BAL_COL    = tokens.findIndex(t => /\b(balance|bal)\b/i.test(t));

    const transactions: TxRow[] = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cells = lines[i].split(/\s{2,}/).map(c => c.trim());
      if (cells.length < 2) continue;

      const dateStr = DATE_COL >= 0 ? cells[DATE_COL] : cells[0];
      const isoDate = this.parseAnyDate(dateStr ?? '');
      if (!isoDate) continue;

      const rawNum = (v?: string) => {
        if (!v) return null;
        const n = parseFloat(v.replace(/,/g, ''));
        return isNaN(n) ? null : n;
      };

      transactions.push({
        date:        isoDate,
        description: DESC_COL >= 0   ? cells[DESC_COL]   || null : null,
        ref:         REF_COL >= 0    ? cells[REF_COL]    || null : null,
        debit:       DEBIT_COL >= 0  ? rawNum(cells[DEBIT_COL])  : null,
        credit:      CREDIT_COL >= 0 ? rawNum(cells[CREDIT_COL]) : null,
        balance:     BAL_COL >= 0    ? rawNum(cells[BAL_COL])    : null,
      });
    }

    return transactions;
  }

  // ── Transactions ──────────────────────────────────────────────────────────

  async getTransactions(accountId: number, page = 1, limit = 50, startDate?: string, endDate?: string): Promise<{
    account: CsvAccount;
    transactions: CsvTransaction[];
    total: number;
    page: number;
    pages: number;
  }> {
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account #${accountId} not found`);

    const qb = this.txRepo.createQueryBuilder('t')
      .where('t.csv_account_id = :accountId', { accountId })
      .orderBy('t.date', 'DESC')
      .addOrderBy('t.id', 'DESC')
      .skip((page - 1) * limit)
      .take(limit);

    if (startDate) qb.andWhere('t.date >= :startDate', { startDate });
    if (endDate) qb.andWhere('t.date <= :endDate', { endDate });

    const [transactions, total] = await qb.getManyAndCount();
    return { account, transactions, total, page, pages: Math.ceil(total / limit) };
  }

  async getAccountsWithStats(startDate?: string, endDate?: string): Promise<Array<CsvAccount & { tx_count: number; latest_date: string; latest_balance: string }>> {
    const dateJoinCondition = [
      't.csv_account_id = a.id',
      startDate ? `t.date >= '${startDate}'` : null,
      endDate   ? `t.date <= '${endDate}'`   : null,
    ].filter(Boolean).join(' AND ');

    const balanceDateClause = [
      startDate ? `t2.date >= '${startDate}'` : null,
      endDate   ? `t2.date <= '${endDate}'`   : null,
    ].filter(Boolean).join(' AND ');
    const balanceWhere = balanceDateClause ? `AND ${balanceDateClause}` : '';

    const rows = await this.accountRepo
      .createQueryBuilder('a')
      .leftJoin('csv_transactions', 't', dateJoinCondition)
      .select('a.id', 'id')
      .addSelect('COUNT(t.id)', 'tx_count')
      .addSelect('MAX(t.date)', 'latest_date')
      .addSelect(
        `(SELECT t2.balance FROM csv_transactions t2 WHERE t2.csv_account_id = a.id ${balanceWhere} ORDER BY t2.date DESC, t2.id DESC LIMIT 1)`,
        'latest_balance',
      )
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
      .addOrderBy('t.id', 'DESC');

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
