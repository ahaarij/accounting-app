import { Injectable } from '@nestjs/common';
import * as XLSX from 'xlsx';
import { normalizeDate, toNumber } from '../utils/date.util';

export interface DailyTxRow {
  date: string;
  sl_no: number | null;
  particulars: string | null;
  source_bank: string | null;
  beneficiary: string | null;
  destination_bank: string | null;
  remittance_ref: string | null;
  amount_aed: number | null;
  amount_usd: number | null;
  amount_eur: number | null;
  pi_reference: string | null;
  invoice_number: string | null;
  transport_ref: string | null;
  reference: string | null;
  transaction_type: string | null;
}

const TX_TYPE_MAP: Record<string, string> = {
  'BANK CHARGES': 'bank_charges',
  'INWARD': 'inward',
  'OUTWARD': 'outward',
  'INTERGROUP': 'intergroup',
  'CASH DEPOSIT': 'cash_deposit',
  'USD TO AED': 'currency_conversion',
  'AED TO USD': 'currency_conversion',
  'AED TO EUR': 'currency_conversion',
  'EUR TO AED': 'currency_conversion',
  'FINANCE REPAYMENT': 'finance_repayment',
  'SALARY PAID': 'salary_paid',
  'CHEQUE PAID': 'cheque_paid',
};
const SKIP_PARTICULARS = new Set(['PAY', 'TOTAL', 'SUB TOTAL', 'SUBTOTAL', 'GRAND TOTAL', 'NET TOTAL']);

function inferTxType(particulars: string | null): string | null {
  if (!particulars) return null;
  const upper = particulars.trim().toUpperCase();
  for (const [key, val] of Object.entries(TX_TYPE_MAP)) {
    if (upper.includes(key)) return val;
  }
  return null;
}

@Injectable()
export class TransactionParser {
  parse(filePath: string): DailyTxRow[] {
    const wb = XLSX.readFile(filePath, { cellFormula: false, sheetStubs: false });
    const all: DailyTxRow[] = [];
    for (const sheetName of wb.SheetNames) {
      const rows = this.parseSheet(wb.Sheets[sheetName]);
      all.push(...rows);
    }
    return all;
  }

  private parseSheet(ws: XLSX.WorkSheet): DailyTxRow[] {
    if (!ws || !ws['!ref']) return [];
    const aoa: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null, raw: false });
    const results: DailyTxRow[] = [];
    let currentDate: string | null = null;
    let colMap: Record<string, number> = {};

    for (let i = 0; i < aoa.length; i++) {
      const row = aoa[i];
      if (!row || row.every(c => c == null)) continue;

      // Date header row
      const first = row[0] != null ? String(row[0]).trim().toUpperCase() : '';
      if (first.startsWith('TRANSACTION ON')) {
        const dateStr = first.replace('TRANSACTION ON', '').trim();
        currentDate = normalizeDate(dateStr);
        continue;
      }

      // Column header row (after date header)
      if (first === 'SL/NO' || first === 'SL NO' || first === 'SL.NO' || first === 'SNO' || first === 'S.NO' || first === 'NO') {
        colMap = {};
        for (let c = 0; c < row.length; c++) {
          if (row[c] == null) continue;
          const h = String(row[c]).trim().toUpperCase().replace(/\s+/g, ' ');
          if (!colMap['sl'] && (h === 'SL/NO' || h === 'SL NO' || h.startsWith('SL') || h === 'NO')) colMap['sl'] = c;
          else if (!colMap['particulars'] && h.includes('PARTICULAR')) colMap['particulars'] = c;
          else if (!colMap['source_bank'] && h === 'A/C' && colMap['particulars'] != null && c > (colMap['particulars'] || 0)) colMap['source_bank'] = c;
          else if (!colMap['beneficiary'] && h.includes('BENEFICIAR')) colMap['beneficiary'] = c;
          else if (!colMap['dest_bank'] && h === 'A/C' && colMap['beneficiary'] != null && c > (colMap['beneficiary'] || 0)) colMap['dest_bank'] = c;
          else if (!colMap['remittance'] && h.includes('REMITTANCE')) colMap['remittance'] = c;
          else if (!colMap['aed'] && h === 'AED') colMap['aed'] = c;
          else if (!colMap['usd'] && h === 'USD') colMap['usd'] = c;
          else if (!colMap['eur'] && (h === 'EUR' || h === 'EURO')) colMap['eur'] = c;
          else if (!colMap['pi'] && h === 'PI') colMap['pi'] = c;
          else if (!colMap['invoice'] && h.includes('INVOICE')) colMap['invoice'] = c;
          else if (!colMap['transport'] && h.includes('TRANSPORT')) colMap['transport'] = c;
          else if (!colMap['reference'] && h === 'REFERENCE') colMap['reference'] = c;
        }
        continue;
      }

      // Skip if no date context or no column map
      if (!currentDate || Object.keys(colMap).length === 0) continue;

      const get = (key: string) => colMap[key] != null ? row[colMap[key]] : null;
      const sl = get('sl');
      if (sl == null || String(sl).trim() === '') continue;

      const particulars = get('particulars') != null ? String(get('particulars')).trim() : null;
      if (particulars && SKIP_PARTICULARS.has(particulars.toUpperCase())) continue;
      results.push({
        date: currentDate,
        sl_no: toNumber(sl),
        particulars,
        source_bank: get('source_bank') != null ? String(get('source_bank')).trim() : null,
        beneficiary: get('beneficiary') != null ? String(get('beneficiary')).trim() : null,
        destination_bank: get('dest_bank') != null ? String(get('dest_bank')).trim() : null,
        remittance_ref: get('remittance') != null ? String(get('remittance')).trim() : null,
        amount_aed: toNumber(get('aed')),
        amount_usd: toNumber(get('usd')),
        amount_eur: toNumber(get('eur')),
        pi_reference: get('pi') != null ? String(get('pi')).trim() : null,
        invoice_number: get('invoice') != null ? String(get('invoice')).trim() : null,
        transport_ref: get('transport') != null ? String(get('transport')).trim() : null,
        reference: get('reference') != null ? String(get('reference')).trim() : null,
        transaction_type: inferTxType(particulars),
      });
    }
    return results;
  }
}
