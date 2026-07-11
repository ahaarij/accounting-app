import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as XLSX from 'xlsx';
import { ExcelImport } from '../entities/excel-import.entity';
import { ExcelAccount } from '../entities/excel-account.entity';
import { ExcelTransaction } from '../entities/excel-transaction.entity';
import { SuspenseRule } from '../entities/suspense-rule.entity';
import { normalizeDescription } from '../common/text.util';

// ── Type inference ────────────────────────────────────────────────────────────

const BANK_CODES_RE = /\b(WIO|ADIB|ENBD|NBF|FAB|ADCB|EIB|RAKBANK|MASHREQ|MSQ|MASRAF|SCB|SIB|BOB|BEA|CITI)\b/;

function inferType(particular: string, deposit: number | null, withdrawal: number | null): string {
  const p = particular.toUpperCase().trim();
  const isIn  = deposit   != null && withdrawal == null;
  const isOut = withdrawal != null && deposit   == null;

  // Opening balance variants
  if (p.includes('OPENING BALANCE') || p.includes('OPENING BLC') || p.includes('OPEING BLC') ||
      p === 'OPENING' || p.startsWith('O/P BAL') || p.startsWith('OP BAL') ||
      p === 'BALANCE CARRIED FORWARD') return 'OPENING_BALANCE';

  // Bank charges (inc. common typos: CHARGS, CHAREGS, CHRGES)
  if (p.includes('BANK CHARGE') || p.includes('BANK CHARG') || p.includes('MAINT FEE') ||
      p.includes('SERVICE CHARGE') || p.includes('MIN BAL') || p.includes('MINIMUM BAL') ||
      /\bCHARGES?\b/.test(p) || /\bCHARGS\b/.test(p) || p === 'CHAREGS' || p === 'CHRGES' ||
      p === 'CHARGS' || p === 'STTA') return 'BANK_CHARGE';

  // VAT / tax
  if ((p.includes('VAT') && !p.includes('CONVERTED')) ||
      /\bFTA\b/.test(p) || p.includes('TAX PAYMENT') || p.includes('FEDERAL TAX')) return 'VAT_CHARGE';

  // FX conversion (adds CONVERTED keyword that was previously missed)
  if (/AED TO USD|USD TO AED|EUR TO|TO EUR|\bFX\b|EXCHANGE RATE/i.test(p) ||
      /\bCONVT?ERTED?\b/.test(p) ||
      /TRANSFERRED TO (USD|AED|EUR|GBP)\b/i.test(p) ||
      /TRF (EUR|EURO|USD|AED|GBP) TO\b/i.test(p)) return 'FX_CONVERSION';

  // Cash deposit
  if (p.includes('CASH DEPOSIT') || p.includes('CASH DEP') ||
      (p === 'DEPOSIT' && isIn)) return 'CASH_DEPOSIT';

  // Cash withdrawal / ATM
  if (/\bATM\b/.test(p) || p.includes('CASH WITHDRAWAL') || p.includes('CASH WITHDRAWL') ||
      p.includes('CASH WITHDRAW') || /\bATM WITHDRAW/.test(p)) return 'OUTWARD_TRANSFER';

  // Cash back / rewards (always in)
  if (p.includes('CASH BACK') || p.includes('CASHBACK') || p.includes('CASH BACK RCVD')) return 'INWARD_TRANSFER';

  // Cheques — return/RTN first, then direction-based
  if ((p.includes('CHQ') || p.includes('CHEQUE')) && (p.includes('RETURN') || p.includes('RTN'))) return 'RETURNED_CHEQUE';
  if (p.includes('CHQ') || p.includes('CHEQUE') || /\bCLEARING\b/.test(p)) {
    if (isIn) return 'INWARD_TRANSFER';
    return 'CHEQUE_PAID';
  }

  // Inward — explicit received/from patterns (many spelling variants from the sheets)
  if (/\bREC(D{1,2}C?|VD|EIVED|IEVED|ECED|IVED|DE)\b/.test(p) ||
      /\bRCVD\b/.test(p) || /\bRCED\b/.test(p) || /\bRECDC\b/.test(p) ||
      p.includes('TRF FROM') || p.includes('TRANSFER FROM') || p.includes('INWARD') ||
      /TT\s+REC(EIVE?D?|ECED?|IVED?|ED?C?|DC)?\s+FROM/i.test(p) ||
      /\bFUND\s+RECD?E?\b/.test(p) ||
      p.startsWith('FROM ') || /^RCD FROM/i.test(p) || /^RCVD FROM/i.test(p) ||
      p.startsWith('RECDFROM') || /^RECDD?\s+FROM/i.test(p) ||
      /RECEIVED?\s+FROM/i.test(p) || /RECEOVED?\s+FROM/i.test(p) ||
      /\bRED\s+FRO\b/.test(p)) return 'INWARD_TRANSFER';

  // Refunds / returned items (always in)
  if (/\bREFUND\b/.test(p) || /\bRETURNED\s+FROM\b/.test(p) || /\bRETURN\s+FROM\b/.test(p)) return 'INWARD_TRANSFER';

  // Bank interest (always in)
  if (p.includes('BANK INTEREST') || p.includes('INTEREST EARNED') || /^DEBIT INTEREST/.test(p)) return 'INWARD_TRANSFER';

  // Internal / own-account transfers
  if (p.startsWith('OWN ACC ') || p.startsWith('OWN ACCOUNT ')) return 'INTERNAL_TRANSFER';

  // Outward — explicit direction keywords
  if (p.includes('TT TRF') || p.includes('TT RF TO') || p.includes('TT T/F TO') ||
      p.includes('TT TRANSGER TO') || p.includes('TT TRANSFE TO') || p.includes('TT TRANSFERT TO') ||
      p.includes('TRF TO') || p.includes('TRFD ') || p.includes('TRFG TO') ||
      p.includes('TRANSFER TO') || p.includes('TRANSFERRED TO') ||
      /TRASFER\s+TO\b/i.test(p) || p.includes('TERF TO') ||
      p.startsWith('TO ') ||
      p.includes('SENT TO') || p.includes('OUTWARD') ||
      p.includes('PAYMENT TO') || p.includes('PAID TO') || p.includes('PAID FOR') ||
      /\bSALARY\b/.test(p) || p.includes('TT TO') ||
      /\bPMNT\s+TO\b/.test(p) || /\bPAMNT\s+TO\b/.test(p)) return 'OUTWARD_TRANSFER';

  // Utilities (always outward)
  if (/\bE(?:TI[SL]AL?A?T|TSALAT|TSLAT|TISLAT|TISALT|TISALT)\b/.test(p) ||
      /\bDEWA\b/.test(p) ||
      p === 'DU' || p.startsWith('DU ') || p.includes('DU MOBILE') || p.includes('DU BILL') ||
      p.includes('DU PAYMENT') || p.includes('DU OFFICE') ||
      p.includes('ELECTRICITY BILL') || p.includes('BILL PAYMENT') || p.includes('BILL PAID') ||
      /\bBILL\s+PAID\b/.test(p) || p.includes('LANDLINE') ||
      /\bSALIK\b/.test(p)) return 'OUTWARD_TRANSFER';

  // Loan / finance repayments
  if (/\bLOAN\s+REPAYMENT\b/.test(p) || p.includes('FINANCE REPAYMENT') ||
      p.includes('FINANCE PAYMENT') || /PAYMENT\s+OF\s+PRINCIPAL/i.test(p) ||
      /REIMBURSEMENT\s+OF\s+INTEREST/i.test(p) ||
      /\bPD\s+(PENALT|PRINCIPAL)\b/i.test(p) ||
      /\bINTEREST\s+REPAYMENT\b/i.test(p) ||
      p.includes('FOR AUTO LOAN')) return 'OUTWARD_TRANSFER';

  // Advertising / subscriptions
  if (/\bGOOGLE\s+ADS\b/.test(p) || p.includes('FACEBOOK') || p.includes('FACE BOOK') ||
      p.includes('AMAZON PRIME') || /\bSHOPIFY\b/.test(p)) return 'OUTWARD_TRANSFER';

  // Insurance
  if (/\bINSURANCE\b/.test(p) || /\bASSURE(DL?Y|LY|FLY)?\b/.test(p)) return 'OUTWARD_TRANSFER';

  // Card / contactless
  if (p.includes('CARD PMNT') || p.includes('CARD PMNTS') || p.includes('CARD PAYMENT') ||
      p.includes('EMARAT CARD') || p.includes('VISA PURCHASE') || /\bDEBIT\s+CARD\b/.test(p)) return 'OUTWARD_TRANSFER';

  // Generic payment / bill
  if (p === 'PAYMENT' || p === 'BILL PAYMENT' || p === 'FINANCE PAYMENT') return 'OUTWARD_TRANSFER';

  // Salik / parking / recharge (always outward)
  if (/\bSALIK\b/.test(p) || p.includes('RECHARGE') ||
      (/PARKING/.test(p) && isOut)) return 'OUTWARD_TRANSFER';

  // LOAN standalone — direction-based (receiving a loan is IN, repayment is OUT)
  if (/\bLOAN\b/.test(p)) return isIn ? 'INWARD_TRANSFER' : 'OUTWARD_TRANSFER';

  // TRF prefix without explicit TO — direction-based
  if (p.startsWith('TRF ') || p.startsWith('TT RF ') || p.startsWith('TT REC') || p.startsWith('TT TRA')) {
    return isIn ? 'INWARD_TRANSFER' : 'OUTWARD_TRANSFER';
  }

  // Company name + bank code pattern — direction-based
  if (BANK_CODES_RE.test(p)) {
    return isIn ? 'INWARD_TRANSFER' : 'OUTWARD_TRANSFER';
  }

  // Final direction fallback — bare company names / amounts with a clear direction
  if (isIn)  return 'INWARD_TRANSFER';
  if (isOut) return 'OUTWARD_TRANSFER';

  return 'SUSPENSE';
}

function normaliseDate(raw: any): string | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{5}$/.test(s)) {
    const info = XLSX.SSF.parse_date_code(parseInt(s));
    return `${info.y}-${String(info.m).padStart(2, '0')}-${String(info.d).padStart(2, '0')}`;
  }
  const m = s.match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{4})$/);
  if (m) {
    const day = parseInt(m[1], 10), month = parseInt(m[2], 10), year = parseInt(m[3], 10);
    // Validate via rollover check — JS will advance invalid dates (e.g. Sep 31 → Oct 1)
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() + 1 !== month || d.getDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return null;
}

// ── Sheet parser ──────────────────────────────────────────────────────────────

interface RawTx {
  date: string | null;
  particular: string;
  deposit: number | null;
  withdrawal: number | null;
  balance: number;
  transaction_type: string;
  is_opening_balance: boolean;
}

// Excel stores numbers as numbers, but some cells are text like "5,000.00"
function toNum(v: any): number | null {
  if (v === '' || v == null) return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

function parseAccountSheet(ws: XLSX.WorkSheet): { txs: RawTx[]; standingBalance: number | null } {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
  const txs: RawTx[] = [];
  let started = false;
  let emptyCount = 0;
  // Some sheets have no transactions at all — just the balance column copied down
  // (e.g. a dormant account holding 8.79). Remember the last balance seen so the
  // account still reports its standing balance.
  let standingBalance: number | null = null;

  for (const row of rows) {
    const [rawDate, particular, deposit, withdrawal, balance] = row;
    const dateStr = normaliseDate(rawDate);
    const particularStr = String(particular ?? '').trim();
    const dep = toNum(deposit);
    const wit = toNum(withdrawal);
    const rawBal = toNum(balance);
    const bal = rawBal ?? 0;
    if (rawBal != null) standingBalance = rawBal;

    if (!started) {
      // Explicit header row ("DATE" / "PARTICULARS" in any variant) — data starts below it
      const rowText = row.map((c: any) => String(c).trim().toUpperCase()).join('|');
      if (rowText.includes('DATE') && (rowText.includes('PARTICULAR') || rowText.includes('DESCRIPTION'))) {
        started = true;
        continue;
      }
      // Some sheets have a blank (colour-only) header row — fall back to detecting
      // the first row that looks like a transaction. The title/preamble rows never
      // qualify: their text sits in column A (not a date) with no amounts. Some
      // sloppy rows have ONLY a deposit/withdrawal (no date, no particular) —
      // those are real transactions too.
      if ((dateStr && (particularStr || dep != null || wit != null)) ||
          dep != null || wit != null ||
          particularStr.toUpperCase().includes('OPENING BALANCE')) {
        started = true; // process this row as data below
      } else {
        continue;
      }
    }

    // Filler rows: the client copies the running balance down thousands of rows
    // (sometimes to row 1,048,576) and only fills date/amounts when a transaction
    // happens. A row with no date, text, or amounts is filler regardless of the
    // balance column — but allow a generous run before giving up, in case of gaps.
    if (!dateStr && !particularStr && dep == null && wit == null) {
      if (++emptyCount >= 30) break;
      continue;
    }
    emptyCount = 0;
    if (!particularStr && dep == null && wit == null) continue;

    const pUp = particularStr.toUpperCase();
    const isOpening = pUp.includes('OPENING BALANCE') || pUp.includes('OPENING BLC') ||
                      pUp.startsWith('O/P BAL') || pUp.startsWith('OP BAL') ||
                      pUp === 'BALANCE CARRIED FORWARD';
    txs.push({
      date: dateStr,
      particular: particularStr,
      deposit: dep,
      withdrawal: wit,
      balance: parseFloat(bal.toFixed(2)),
      transaction_type: isOpening ? 'OPENING_BALANCE' : inferType(particularStr, dep, wit),
      is_opening_balance: isOpening,
    });
  }
  return { txs, standingBalance }; // txs chronological (oldest first) — reversed to newest-first in getTransactions
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ExcelBalanceService {
  constructor(
    @InjectRepository(ExcelImport) private imports: Repository<ExcelImport>,
    @InjectRepository(ExcelAccount) private accounts: Repository<ExcelAccount>,
    @InjectRepository(ExcelTransaction) private transactions: Repository<ExcelTransaction>,
    @InjectRepository(SuspenseRule) private rules: Repository<SuspenseRule>,
  ) {}

  async importFile(buffer: Buffer, filename: string): Promise<ExcelImport> {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const allNames: string[] = wb.SheetNames;

    // Remembered suspense classifications — shared with the PDF/CSV statement
    // importer, so a rule saved in Suspense Review applies here too
    const savedRules = await this.rules.find();
    const ruleMap = new Map(savedRules.map((r) => [r.match_text, r]));

    // Build summary map from SUMMARY sheet(s)
    type SummaryEntry = { account_code: string; remarks: string; display_name: string; aed: number | null; usd: number | null; eur: number | null };
    const summaryMap = new Map<string, SummaryEntry>();
    let group = '?';

    for (const name of allNames) {
      if (!name.trim().toUpperCase().startsWith('SUMMARY')) continue;
      const ws = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' }) as any[][];
      for (const row of rows) {
        const text = String(row.join(' ')).toUpperCase();
        if (group === '?') {
          if (text.includes('GROUP A')) group = 'A';
          else if (text.includes('GROUP B')) group = 'B';
        }
        const code = String(row[0] ?? '').trim();
        const cName = String(row[1] ?? '').trim();
        if (!code || !cName || !/^[\dA-Z]+$/.test(code)) continue;
        summaryMap.set(cName.toUpperCase(), {
          account_code: code,
          display_name: cName,
          remarks: (typeof row[5] === 'string' && row[5].trim()) ? row[5].trim() : '',
          aed: row[2] !== '' && row[2] != null ? Number(row[2]) : null,
          usd: row[3] !== '' && row[3] != null ? Number(row[3]) : null,
          eur: row[4] !== '' && row[4] != null ? Number(row[4]) : null,
        });
      }
    }

    if (group !== 'A' && group !== 'B') {
      throw new BadRequestException('File does not appear to be a valid Group A or Group B balance sheet — no SUMMARY sheet with group identifier found.');
    }

    // Create an import record for audit history
    const imp = this.imports.create({ filename, group, account_count: 0 });
    await this.imports.save(imp);

    const accountSheets = allNames.filter(n => !n.trim().toUpperCase().startsWith('SUMMARY'));
    let sortIdx = 0;
    const CURRENCIES = new Set(['AED', 'USD', 'EUR', 'EURO', 'GBP']);

    for (const sheetName of accountSheets) {
      // Strip duplicate-sheet suffixes like "(2)", "(3)" that Excel appends automatically
      const cleanName = sheetName.trim().replace(/\s*\(\d+\)\s*$/, '');
      const parts = cleanName.split(/\s+/).filter(Boolean);
      const lastWord = (parts[parts.length - 1] ?? '').toUpperCase();
      const hasCurrency = CURRENCIES.has(lastWord);

      const currency = hasCurrency ? lastWord : '';
      const bankName = hasCurrency ? (parts[parts.length - 2] ?? '') : (parts[parts.length - 1] ?? '');
      const companyName = hasCurrency ? parts.slice(0, -2).join(' ') : parts.slice(0, -1).join(' ');

      let entry = summaryMap.get(companyName.toUpperCase());
      const exactMatch = !!entry;
      if (!entry) {
        for (const [key, val] of summaryMap.entries()) {
          if (companyName.toUpperCase().startsWith(key) || key.startsWith(companyName.toUpperCase())) {
            entry = val; break;
          }
        }
      }

      const ws = wb.Sheets[sheetName];
      const { txs: rawTxs, standingBalance } = ws ? parseAccountSheet(ws) : { txs: [], standingBalance: null };
      const nonOpening = rawTxs.filter(t => !t.is_opening_balance);
      const closing = rawTxs.length > 0 ? rawTxs[rawTxs.length - 1].balance : standingBalance;

      // Only carry remarks from an exact SUMMARY match — fuzzy matches can pull
      // remarks from the wrong company when names are prefixes of each other.
      const remarksValue = exactMatch && entry?.remarks ? entry.remarks : null;

      // ── Upsert account — stable identity is (group, sheet_name) ──────────
      let acct = await this.accounts.findOne({ where: { group, sheet_name: sheetName } as any });
      if (acct) {
        acct.import_id    = imp.id;
        acct.company_name = exactMatch ? (entry?.display_name ?? companyName) : companyName;
        acct.bank_name    = bankName;
        acct.currency     = currency;
        if (entry?.account_code) acct.account_code = entry.account_code;
        if (remarksValue)        acct.remarks = remarksValue;
        acct.closing_balance   = closing;
        acct.transaction_count = nonOpening.length;
        await this.accounts.save(acct);
      } else {
        acct = this.accounts.create({
          group,
          import_id: imp.id,
          sheet_name: sheetName,
          company_name: exactMatch ? (entry?.display_name ?? companyName) : companyName,
          bank_name: bankName,
          currency,
          account_code: entry?.account_code ?? null,
          remarks: remarksValue,
          closing_balance: closing,
          transaction_count: nonOpening.length,
          sort_order: sortIdx,
        });
        await this.accounts.save(acct);
      }
      sortIdx++;

      if (rawTxs.length === 0) continue;

      // ── Upsert transactions keyed by (account_id, sheet_row_index) ───────
      // rawTxs is chronological (index 0 = oldest row in the sheet).
      // ON CONFLICT: update everything EXCEPT custom_label when the user has
      // already manually classified the row, and preserve transaction_type too
      // in that case so the manual classification isn't wiped on re-import.
      const CHUNK = 500;
      for (let start = 0; start < rawTxs.length; start += CHUNK) {
        const chunk = rawTxs.slice(start, start + CHUNK);
        const params: any[] = [];
        const valueClauses: string[] = [];

        chunk.forEach((t, idx) => {
          let type = t.transaction_type;
          let customLabel: string | null = null;
          if (type === 'SUSPENSE') {
            const rule = ruleMap.get(normalizeDescription(t.particular));
            if (rule) { type = rule.transaction_type; customLabel = rule.label; }
          }
          const sheetRowIndex = start + idx;
          const base = params.length + 1;
          params.push(
            acct.id, sheetRowIndex,
            t.date ?? null, t.particular,
            t.deposit ?? null, t.withdrawal ?? null, t.balance,
            type, t.is_opening_balance, customLabel,
          );
          valueClauses.push(
            `($${base},$${base+1},$${base+2},$${base+3},$${base+4},$${base+5},$${base+6},$${base+7},$${base+8},$${base+9})`,
          );
        });

        await this.accounts.manager.query(`
          INSERT INTO excel_transactions
            (account_id, sheet_row_index, date, particular, deposit, withdrawal, balance,
             transaction_type, is_opening_balance, custom_label)
          VALUES ${valueClauses.join(',')}
          ON CONFLICT (account_id, sheet_row_index) DO UPDATE SET
            date               = EXCLUDED.date,
            particular         = EXCLUDED.particular,
            deposit            = EXCLUDED.deposit,
            withdrawal         = EXCLUDED.withdrawal,
            balance            = EXCLUDED.balance,
            is_opening_balance = EXCLUDED.is_opening_balance,
            transaction_type   = CASE
              WHEN excel_transactions.custom_label IS NOT NULL
              THEN excel_transactions.transaction_type
              ELSE EXCLUDED.transaction_type
            END,
            custom_label = COALESCE(excel_transactions.custom_label, EXCLUDED.custom_label)
        `, params);
      }
    }

    await this.imports.update(imp.id, { account_count: accountSheets.length });
    imp.account_count = accountSheets.length;
    return imp;
  }

  async listImports(): Promise<ExcelImport[]> {
    return this.imports.find({ order: { imported_at: 'DESC' } });
  }

  async getAccounts(importId: number): Promise<ExcelAccount[]> {
    return this.accounts.find({
      where: { import_id: importId },
      order: { sort_order: 'ASC' },
    });
  }

  async getTransactions(accountId: number): Promise<ExcelTransaction[]> {
    return this.transactions.find({
      where: { account_id: accountId },
      order: { sheet_row_index: 'DESC' },
    });
  }

  async getAllAccounts(): Promise<any[]> {
    return this.accounts.manager.query(`
      SELECT
        ea.*,
        ea.group AS import_group,
        ei.filename AS import_filename,
        ei.imported_at AS import_date,
        MAX(et.date) AS last_transaction_date
      FROM excel_accounts ea
      LEFT JOIN excel_imports ei ON ea.import_id = ei.id
      LEFT JOIN excel_transactions et ON et.account_id = ea.id AND et.is_opening_balance = false
      GROUP BY ea.id, ei.filename, ei.imported_at
      ORDER BY ea.sort_order ASC
    `);
  }

  async getAccountStats(from: string, to: string): Promise<any[]> {
    return this.transactions.manager.query(`
      WITH tx_in_range AS (
        SELECT account_id, COUNT(*)::int AS txn_count
        FROM excel_transactions
        WHERE date >= $1::date AND date <= $2::date AND is_opening_balance = false
        GROUP BY account_id
      ),
      last_balance AS (
        SELECT DISTINCT ON (account_id)
          account_id, balance AS closing_balance
        FROM excel_transactions
        WHERE date <= $2::date AND is_opening_balance = false
        ORDER BY account_id, date DESC, sheet_row_index DESC
      )
      SELECT
        ea.id AS account_id,
        COALESCE(tr.txn_count, 0) AS transaction_count,
        lb.closing_balance
      FROM excel_accounts ea
      LEFT JOIN tx_in_range tr ON ea.id = tr.account_id
      LEFT JOIN last_balance lb ON ea.id = lb.account_id
    `, [from, to]);
  }

  async getBalanceTrend(days: number): Promise<{ date: string; aed: number; usd: number }[]> {
    return this.transactions.manager.query(`
      WITH ranked AS (
        SELECT
          et.account_id,
          ea.currency,
          et.date,
          et.balance,
          ROW_NUMBER() OVER (PARTITION BY et.account_id, et.date ORDER BY et.sheet_row_index DESC) AS rn
        FROM excel_transactions et
        JOIN excel_accounts ea ON et.account_id = ea.id
        WHERE et.date IS NOT NULL
          AND et.is_opening_balance = false
          AND et.date >= CURRENT_DATE - ($1::int * INTERVAL '1 day')
      )
      SELECT
        to_char(date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(CASE WHEN currency = 'AED' THEN balance::float ELSE 0 END), 0) AS aed,
        COALESCE(SUM(CASE WHEN currency = 'USD' THEN balance::float ELSE 0 END), 0) AS usd
      FROM ranked
      WHERE rn = 1
      GROUP BY date
      ORDER BY date
    `, [days]);
  }

  async deleteImport(importId: number): Promise<void> {
    // Only removes the audit record — accounts and transactions are kept
    await this.imports.delete(importId);
  }

  async deleteAllData(): Promise<{ deleted: number }> {
    const result = await this.transactions.manager.query(
      `DELETE FROM excel_transactions RETURNING id`
    );
    await this.accounts.manager.query(`DELETE FROM excel_accounts`);
    await this.imports.manager.query(`DELETE FROM excel_imports`);
    return { deleted: result.length };
  }

  async getTransactionsByDate(date: string): Promise<any[]> {
    return this.transactions.manager.query(`
      SELECT
        et.id,
        et.date::text AS date,
        et.particular,
        et.deposit,
        et.withdrawal,
        et.balance,
        et.transaction_type,
        et.custom_label,
        et.sheet_row_index,
        ea.id AS account_id,
        ea.company_name,
        ea.bank_name,
        ea.currency,
        ea.group AS import_group,
        ea.account_code
      FROM excel_transactions et
      JOIN excel_accounts ea ON ea.id = et.account_id
      WHERE et.date = $1::date AND et.is_opening_balance = false
      ORDER BY ea.company_name ASC, ea.bank_name ASC, et.sheet_row_index ASC
    `, [date]);
  }

  async getExcelSuspenseTransactions(): Promise<any[]> {
    return this.transactions.manager.query(`
      SELECT e.id, 'excel' AS source, e.date::text AS date, e.particular AS description, NULL AS ref,
             e.withdrawal AS debit, e.deposit AS credit, NULL AS bank_detected,
             ea.company_name, ea.bank_name, ea.currency
      FROM excel_transactions e
      JOIN excel_accounts ea ON ea.id = e.account_id
      WHERE e.transaction_type = 'SUSPENSE'
      ORDER BY date DESC NULLS LAST, e.id DESC
    `);
  }
}
