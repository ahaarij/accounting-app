import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { normalizeDate, toNumber } from '../utils/date.util';

export interface SummaryRow {
  account_code: string | null;
  company_name: string | null;
  aed_balance: number | null;
  usd_balance: number | null;
  eur_balance: number | null;
  remarks: string | null;
}

export interface AccountSheetData {
  sheet_name: string;
  company_name: string | null;
  bank_name: string | null;
  currency: string | null;
  opening_balance: number | null;
  transactions: TransactionRow[];
}

export interface TransactionRow {
  date: string | null;
  particular: string | null;
  deposit: number | null;
  withdrawal: number | null;
  running_balance: number | null;
}

@Injectable()
export class GroupAParser {
  parse(filePath: string): { summary: SummaryRow[]; accounts: AccountSheetData[] } {
    const wb = XLSX.readFile(filePath, { cellFormula: false, sheetStubs: false });
    const summarySheet = wb.SheetNames.find(n => n.trim().toLowerCase() === 'summary');
    const summary = summarySheet ? this.parseSummaryWs(wb.Sheets[summarySheet]) : [];
    const accounts = this.parseAccountSheets(wb);
    return { summary, accounts };
  }

  protected parseSummaryWs(ws: XLSX.WorkSheet): SummaryRow[] {
    const ref = ws['!ref'];
    if (!ref) return [];
    const range = XLSX.utils.decode_range(ref);
    const rows: SummaryRow[] = [];
    let colRemarks = 5;

    // Scan first 10 rows for REMARKS column
    for (let r = range.s.r; r <= Math.min(range.e.r, 10); r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c })];
        const val = cell ? String(cell.v || '').trim().toUpperCase() : '';
        if (val.includes('REMARK')) { colRemarks = c; }
      }
    }

    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const get = (c: number) => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; return cell ? cell.v : null; };
      const a = get(0); const b = get(1);
      if (a == null && b == null) continue;
      rows.push({
        account_code: a != null ? String(a).trim() : null,
        company_name: b != null ? String(b).trim() : null,
        aed_balance: toNumber(get(2)),
        usd_balance: toNumber(get(3)),
        eur_balance: toNumber(get(4)),
        remarks: get(colRemarks) != null ? String(get(colRemarks)).trim() : null,
      });
    }
    return rows;
  }

  protected parseAccountSheets(wb: XLSX.WorkBook): AccountSheetData[] {
    const results: AccountSheetData[] = [];
    for (const sheetName of wb.SheetNames) {
      if (sheetName.trim().toLowerCase().startsWith('summary')) continue;
      const ws = wb.Sheets[sheetName];
      if (!ws || !ws['!ref']) continue;
      const range = XLSX.utils.decode_range(ws['!ref']);
      if (range.e.r < 2) continue;

      const companyCell = ws[XLSX.utils.encode_cell({ r: 0, c: 0 })];
      const companyRaw = companyCell ? String(companyCell.v || '').trim() : null;
      const { company_name, bank_name, currency } = this.parseSheetMeta(sheetName, companyRaw);

      let headerRow = 2;
      for (let r = 0; r <= Math.min(range.e.r, 5); r++) {
        const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
        const val = cell ? String(cell.v || '').trim().toUpperCase() : '';
        if (val === 'DATE' || val === 'DATE ') { headerRow = r; break; }
      }

      const transactions: TransactionRow[] = [];
      let emptyStreak = 0;
      let opening_balance: number | null = null;

      const OPENING_LABELS = ['OPENING BALANCE', 'OPENING BLC', 'OPEING BLC', 'OPENING BAL', 'OP. BAL', 'OP BAL'];

      for (let r = headerRow + 1; r <= range.e.r; r++) {
        const get = (c: number) => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; return cell ? cell.v : null; };
        const getW = (c: number) => { const cell = ws[XLSX.utils.encode_cell({ r, c })]; return cell ? (cell.w || cell.v) : null; };
        const d=get(0), p=get(1), dep=get(2), wd=get(3), bal=get(4);
        if (d==null && p==null && dep==null && wd==null && bal==null) {
          if (++emptyStreak >= 5) break;
          continue;
        }
        emptyStreak = 0;
        const pStr = p ? String(p).trim().toUpperCase() : '';
        if (pStr === 'PARTICULAR' || pStr === 'PARTICULARS' || pStr === 'PARTICULAR ') continue;

        // Detect opening balance row
        if (OPENING_LABELS.some(lbl => pStr.includes(lbl))) {
          opening_balance = toNumber(bal);
          continue;
        }

        transactions.push({
          date: normalizeDate(getW(0)),
          particular: p ? String(p).trim() : null,
          deposit: toNumber(dep),
          withdrawal: toNumber(wd),
          running_balance: toNumber(bal),
        });
      }

      // Derive opening balance from first transaction if not found explicitly
      if (opening_balance === null && transactions.length > 0) {
        const first = transactions[0];
        if (first.running_balance != null) {
          opening_balance = first.running_balance - (first.deposit ?? 0) + (first.withdrawal ?? 0);
        }
      }

      results.push({ sheet_name: sheetName, company_name, bank_name, currency, opening_balance, transactions });
    }
    return results;
  }

  protected parseSheetMeta(sheetName: string, row0: string | null): { company_name: string | null; bank_name: string | null; currency: string | null } {
    const BANKS = ['ENBD','FAB','NBF','SIB','ADIB','WIO','MASHREQ','MSQ','RAK','EIB','UBL','AL MASRAF','ALMASRAF','AJMAN'];
    const CURRENCIES = ['AED','USD','EUR'];
    let bank_name: string | null = null;
    let currency: string | null = null;
    const upper = sheetName.toUpperCase();
    for (const c of CURRENCIES) { if (upper.includes(' '+c) || upper.includes(c+' ') || upper.endsWith(c)) { currency=c; break; } }
    if (!currency && row0) {
      const r = row0.toUpperCase();
      for (const c of CURRENCIES) { if (r.includes(c)) { currency=c; break; } }
    }
    for (const b of BANKS) { if (upper.includes(b)) { bank_name = (b==='MSQ'?'MASHREQ':b); break; } }
    let company_name = sheetName.trim();
    // Only strip bank and currency tokens when a currency is explicitly present.
    // Without a currency suffix, "Silverstone WIO" must stay distinct from "Silverstone WIO AED".
    if (currency) {
      if (bank_name) {
        const idx = company_name.toUpperCase().indexOf(bank_name);
        if (idx >= 0) company_name = company_name.substring(0, idx).trim();
      }
      if (company_name.toUpperCase().endsWith(currency)) {
        company_name = company_name.substring(0, company_name.length - currency.length).trim();
      }
    }
    // Prefer the cell value (row 0) — it is the author-set canonical company name
    // and is unaffected by sheet-tab typos. Fall back to the sheet-name-derived name
    // only when the cell is blank.
    const resolved = (row0 && row0.trim()) ? row0.trim() : company_name;
    return { company_name: resolved || null, bank_name, currency };
  }
}
