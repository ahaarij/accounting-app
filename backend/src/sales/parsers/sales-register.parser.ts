import * as XLSX from 'xlsx';
import { normalizeDate, toNumber } from '../../import/utils/date.util';

export interface ParsedInvoice {
  source_company: string;
  customer_name: string | null;
  voucher_no: string | null;
  voucher_ref_no: string | null;
  invoice_date: string | null;
  gross_total: number | null;
  product: string | null;
  currency: string;
  is_cancelled: boolean;
}

export class SalesRegisterParser {
  parse(filePath: string): ParsedInvoice[] {
    const workbook = XLSX.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null });

    const sourceCompany = this.detectCompany(rows);
    const headerIdx = rows.findIndex(
      (r) => r && String(r[0] ?? '').toLowerCase() === 'date',
    );
    if (headerIdx === -1) return [];

    const header: string[] = rows[headerIdx].map((h: any) => String(h ?? '').trim());
    const col = (name: string) => header.findIndex((h) => h.toLowerCase().includes(name.toLowerCase()));

    const idxDate = 0;
    const idxParticulars = col('particulars');
    const idxVoucherNo = col('voucher no');
    const idxVoucherRef = col('voucher ref');
    const idxGrossTotal = col('gross total');

    const results: ParsedInvoice[] = [];

    let i = headerIdx + 1;
    while (i < rows.length) {
      const txRow = rows[i];
      const descRow = rows[i + 1] ?? [];

      // Stop at trailing empty rows
      if (!txRow || txRow.every((c: any) => c == null)) break;

      const rawDate = txRow[idxDate];
      const rawParticulars = txRow[idxParticulars] ?? null;
      const rawVoucherNo = txRow[idxVoucherNo] ?? null;
      const rawVoucherRef = txRow[idxVoucherRef] ?? null;
      const rawGross = txRow[idxGrossTotal] ?? null;
      const rawProduct = descRow[idxParticulars] ?? null;

      const particularsStr = rawParticulars ? String(rawParticulars) : '';
      const isCancelled = particularsStr.toLowerCase().includes('cancelled');
      const customerName = particularsStr.replace(/\(cancelled\s*\)/gi, '').trim() || null;

      results.push({
        source_company: sourceCompany,
        customer_name: customerName,
        voucher_no: rawVoucherNo ? String(rawVoucherNo).trim() : null,
        voucher_ref_no: rawVoucherRef ? String(rawVoucherRef).trim() : null,
        invoice_date: normalizeDate(rawDate),
        gross_total: toNumber(rawGross),
        product: rawProduct ? String(rawProduct).trim() : null,
        currency: 'AED',
        is_cancelled: isCancelled,
      });

      i += 2;
    }

    return results.filter((r) => r.gross_total != null || r.voucher_no != null);
  }

  private detectCompany(rows: any[][]): string {
    const title = String(rows[0]?.[0] ?? '').trim();
    if (!title) return 'unknown';
    // Strip common legal suffixes, take first 2 meaningful words as slug
    const legalStop = new Set([
      'llc', 'ltd', 'limited', 'fze', 'fzco', 'fz', 'dwc',
      'trading', 'general', 'international', 'company', 'co', 'corp', 'inc',
    ]);
    const words = title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 1 && !legalStop.has(w));
    return words.slice(0, 2).join('_') || 'unknown';
  }
}
