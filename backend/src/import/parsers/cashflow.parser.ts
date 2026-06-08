import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import * as path from 'path';
import { normalizeDate, toNumber } from '../utils/date.util';

export interface CashflowRow {
  date: string;
  transaction_group: string | null;
  amount_aed: number | null;
  amount_usd: number | null;
}

export interface CounterpartyRow {
  date: string;
  counterparty_name: string;
  opening_balance_aed: number | null;
  opening_balance_usd: number | null;
  inward_fund: number | null;
  outward_fund: number | null;
  commission_aed: number | null;
  closing_balance_aed: number | null;
  closing_balance_usd: number | null;
  status: 'owed_to_them' | 'owed_by_them' | null;
}

@Injectable()
export class CashflowParser {
  parse(filePath: string): { cashflow: CashflowRow[]; counterparties: CounterpartyRow[] } {
    // Date comes from filename e.g. "5-5-2026.xlsx"
    const filename = path.basename(filePath, '.xlsx');
    const dateFromFile = normalizeDate(filename);
    const fileDate = dateFromFile || new Date().toISOString().substring(0, 10);

    const wb = XLSX.readFile(filePath, { cellFormula: false, sheetStubs: false, cellStyles: true });
    const cashflow = this.parseCashflowSheet(wb.Sheets[wb.SheetNames[0]], fileDate);
    const counterparties = wb.SheetNames.length > 1
      ? this.parseCounterpartySheet(wb.Sheets[wb.SheetNames[1]], fileDate)
      : [];
    return { cashflow, counterparties };
  }

  private parseCashflowSheet(ws: XLSX.WorkSheet, fileDate: string): CashflowRow[] {
    if (!ws || !ws['!ref']) return [];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    const rows: CashflowRow[] = [];
    let date = fileDate;
    let inTransactionSection = false;

    for (const row of aoa) {
      if (!row || row.every(c => c == null)) continue;

      const col1 = row[1] != null ? String(row[1]).trim() : '';
      const col1Upper = col1.toUpperCase();

      // Extract date from "CASHFLOW AS OF DD/MM/YYYY" header
      if (!inTransactionSection && col1Upper.includes('CASHFLOW')) {
        const match = col1.match(/(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/);
        if (match) { const d = normalizeDate(match[1]); if (d) date = d; }
        continue;
      }

      // The "NATURE" header row marks the start of the actual transactions section
      if (col1Upper === 'NATURE') {
        inTransactionSection = true;
        continue;
      }

      // "Cl Bal" or "REMARKS" marks the end of the transactions section
      if (inTransactionSection && (col1Upper === 'CL BAL' || col1Upper === 'REMARKS')) {
        break;
      }

      if (!inTransactionSection) continue;

      // Only include rows where Nature = "CASH"
      if (col1Upper !== 'CASH') continue;

      const description = row[2] != null ? String(row[2]).trim() : null;
      if (!description) continue;

      // Columns: [1]=Nature [2]=Description [3]=Inward AED [4]=Inward USD [5]=Outward AED [6]=Outward USD
      rows.push({
        date,
        transaction_group: description,
        amount_aed: toNumber(row[3]) ?? toNumber(row[5]),
        amount_usd: toNumber(row[4]) ?? toNumber(row[6]),
      });
    }
    return rows;
  }

  private getStatusFromColor(ws: XLSX.WorkSheet, wsRow: number, col: number): 'owed_to_them' | 'owed_by_them' | null {
    const addr = XLSX.utils.encode_cell({ r: wsRow, c: col });
    const cell = (ws as any)[addr];
    if (!cell?.s) return null;
    const argb: string | undefined =
      cell.s.fgColor?.argb ?? cell.s.fgColor?.rgb ?? cell.s.bgColor?.argb ?? cell.s.bgColor?.rgb;
    if (!argb || argb === 'FFFFFFFF' || argb === 'FFFFFF' || argb === '00000000') return null;
    // Normalize to 6-char RGB (strip leading alpha if 8-char ARGB)
    const hex = (argb.length === 8 ? argb.slice(2) : argb).toUpperCase().padStart(6, '0');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    if (g > r && g > b && g > 80) return 'owed_by_them'; // green fill → to receive
    if (r > g && r > b && r > 80) return 'owed_to_them'; // red fill → to pay
    return null;
  }

  private parseCounterpartySheet(ws: XLSX.WorkSheet, fileDate: string): CounterpartyRow[] {
    if (!ws || !ws['!ref']) return [];
    const range = XLSX.utils.decode_range(ws['!ref']!);
    const startRow = range.s.r;
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: true });
    const rows: CounterpartyRow[] = [];

    // From actual file inspection (Sheet2):
    // Row 2: ["COMMENTS", null, null, "OPENING BALANCE", null, null, "INWARD FUND", null, "OUTWARD FUND", null, null, "CASH TRADE COMMISSION (AED)", null, "CLOSING BALANCE", ...]
    // Row 3: [null, null, null, "AED", "USD", null, null, null, null, null, null, null, null, "AED", "USD", ...]
    // Data rows: [null, null, "CENTURY (HK)", ob_aed, ob_usd, null, inward, null, outward, null, null, commission, null, cb_aed, cb_usd, ...]
    // Name is at col 2, ob_aed=3, ob_usd=4, inward=6, outward=8, commission=11, cb_aed=13, cb_usd=14

    let headerParsed = false;
    let nameCol = 2;
    let obAedCol = 3, obUsdCol = 4, inwardCol = 6, outwardCol = 8, commCol = 11, cbAedCol = 13, cbUsdCol = 14;

    for (let i = 0; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || row.every(c => c == null)) continue;

      // Try to auto-detect header row by scanning for "OPENING BALANCE" or "COMMENTS"
      if (!headerParsed) {
        let foundHeader = false;
        for (let c = 0; c < row.length; c++) {
          if (row[c] == null) continue;
          const h = String(row[c]).trim().toUpperCase();
          if (h === 'COMMENTS' || h === 'NAME') { nameCol = 2; foundHeader = true; }
          if (h.includes('OPENING BALANCE')) { obAedCol = c; }
          if (h.includes('INWARD FUND')) { inwardCol = c; }
          if (h.includes('OUTWARD FUND')) { outwardCol = c; }
          if (h.includes('COMMISSION')) { commCol = c; }
          if (h.includes('CLOSING BALANCE')) { cbAedCol = c; }
        }
        if (foundHeader) { headerParsed = true; }
        continue;
      }

      // Data row: name at col 2
      const nameVal = row[nameCol];
      if (nameVal == null || String(nameVal).trim() === '') continue;
      const nameStr = String(nameVal).trim();
      const nameUpper = nameStr.toUpperCase();
      if (nameUpper === 'COMMENTS' || nameUpper === 'TOTAL' || nameUpper === 'NAME' || nameUpper === 'AED' || nameUpper === 'USD') continue;
      if (!isNaN(Number(nameVal))) continue;

      const cb_aed = toNumber(row[cbAedCol]);
      const cb_usd = toNumber(row[cbAedCol + 1] ?? row[cbUsdCol]);

      // Derive status from closing balance cell color — red = owed_to_them, green = owed_by_them.
      const wsRow = startRow + i;
      const ob_aed = toNumber(row[obAedCol]);
      const colorStatus = this.getStatusFromColor(ws, wsRow, cbAedCol);
      const status: CounterpartyRow['status'] = colorStatus ?? (cb_aed == null ? null : cb_aed < 0 ? 'owed_to_them' : 'owed_by_them');

      rows.push({
        date: fileDate,
        counterparty_name: nameStr,
        opening_balance_aed: toNumber(row[obAedCol]),
        opening_balance_usd: toNumber(row[obAedCol + 1] ?? row[obUsdCol]),
        inward_fund: toNumber(row[inwardCol]),
        outward_fund: toNumber(row[outwardCol]),
        commission_aed: toNumber(row[commCol]),
        closing_balance_aed: cb_aed,
        closing_balance_usd: cb_usd,
        status,
      });
    }
    return rows;
  }
}
