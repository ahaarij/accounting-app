import { useEffect, useState, useMemo, useRef } from 'react';
import XLSX from 'xlsx-js-style';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { getSalesCustomerSummary, getSalesCompanies } from '../api';
import { fmtDate } from '../utils/format';
import { ChevronDown, ChevronRight, Download, Search } from 'lucide-react';

function fmtNum(v: any) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    unpaid:   { label: 'Unpaid',         cls: 'bg-red-100 text-red-700' },
    partial:  { label: 'Partial',        cls: 'bg-amber-100 text-amber-700' },
    paid:     { label: 'Paid',           cls: 'bg-green-100 text-green-700' },
    overpaid: { label: 'Need invoice',   cls: 'bg-blue-100 text-blue-700' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-gray-100 text-gray-600' };
  return (
    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded ${s.cls}`}>
      {s.label}
    </span>
  );
}

function CompanyLabel({ company }: { company: string }) {
  return (
    <span className="text-xs text-gray-500">
      {company.replace(/_/g, ' ')}
    </span>
  );
}

// ── Per-invoice expandable row ────────────────────────────────────────────────

function InvoiceRow({ inv }: { inv: any }) {
  const [open, setOpen] = useState(false);
  const hasTxns = inv.transactions?.length > 0;

  return (
    <>
      <tr
        className={`text-xs border-t border-gray-100 ${hasTxns ? 'cursor-pointer hover:bg-white' : ''} ${inv.status === 'unpaid' ? 'bg-red-50/40' : inv.status === 'paid' ? 'bg-green-50/40' : 'bg-amber-50/20'}`}
        onClick={() => hasTxns && setOpen(o => !o)}
      >
        <td className="py-1.5 pl-2 w-5 text-gray-300">
          {hasTxns ? (open ? <ChevronDown size={12} /> : <ChevronRight size={12} />) : null}
        </td>
        <td className="py-1.5 pr-3 font-mono text-gray-600">{inv.voucher_no ?? '—'}</td>
        <td className="py-1.5 pr-3 text-gray-500">{fmtDate(inv.invoice_date)}</td>
        <td className="py-1.5 pr-3 text-gray-400 truncate max-w-[180px]" title={inv.product}>{inv.product ?? '—'}</td>
        <td className="py-1.5 pr-3 text-right font-mono text-gray-700">{fmtNum(inv.gross_total)}</td>
        <td className="py-1.5 pr-3 text-right font-mono text-green-700">{inv.received > 0 ? fmtNum(inv.received) : '—'}</td>
        <td className="py-1.5 pr-3 text-right font-mono font-semibold text-red-600">
          {inv.outstanding > 0 ? fmtNum(inv.outstanding) : <span className="text-green-600">—</span>}
        </td>
        <td className="py-1.5"><StatusBadge status={inv.status} /></td>
      </tr>

      {/* Bank transactions that cover this invoice */}
      {open && inv.transactions.map((t: any, i: number) => (
        <tr key={i} className="text-[11px] bg-blue-50/40 border-t border-blue-100">
          <td className="py-1 pl-6" />
          <td className="py-1 text-blue-400 italic" colSpan={2}>{fmtDate(t.date)}</td>
          <td className="py-1 text-blue-500 truncate max-w-[180px]" title={t.particular}>
            {t.account_name} · {t.bank_name}
          </td>
          <td className="py-1 text-right font-mono text-gray-500">
            {t.currency && t.currency !== 'AED'
              ? <>{fmtNum(t.deposit)} {t.currency} <span className="text-gray-400">= {fmtNum(t.deposit_aed)} AED</span></>
              : <>{fmtNum(t.deposit)} AED</>}
          </td>
          <td className="py-1 text-right font-mono text-blue-700 font-semibold">{fmtNum(t.applied)} AED</td>
          <td colSpan={2} className="py-1 pl-2 text-blue-400 truncate max-w-[160px]" title={t.particular}>
            {t.particular}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── Per-customer expandable row ───────────────────────────────────────────────

function CustomerRow({ row }: { row: any }) {
  const [open, setOpen] = useState(false);
  const diff = row.total_outstanding;
  const diffColor = diff > 0 ? 'text-red-600' : diff < 0 ? 'text-blue-600' : 'text-green-600';

  return (
    <>
      <tr
        className={`hover:bg-gray-50 cursor-pointer ${row.status === 'unpaid' ? 'bg-red-50/30' : row.status === 'overpaid' ? 'bg-blue-50/30' : ''}`}
        onClick={() => setOpen(o => !o)}
      >
        <td className="px-4 py-3 w-6 text-gray-400">
          {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </td>
        <td className="px-4 py-3">
          <p className="font-medium text-gray-900 text-sm">{row.customer_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">
            {row.invoice_count} invoice{row.invoice_count !== 1 ? 's' : ''} ·{' '}
            {fmtDate(row.first_invoice)}
            {row.first_invoice !== row.last_invoice ? ` – ${fmtDate(row.last_invoice)}` : ''}
          </p>
        </td>
        <td className="px-4 py-3"><CompanyLabel company={row.source_company} /></td>
        <td className="px-4 py-3 text-right font-mono text-gray-700">{fmtNum(row.total_invoiced)}</td>
        <td className="px-4 py-3 text-right font-mono text-gray-600">{fmtNum(row.total_received)}</td>
        <td className={`px-4 py-3 text-right font-mono font-semibold ${diffColor}`}>
          {diff === 0 ? '0.00' : fmtNum(Math.abs(diff))}
        </td>
        <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
      </tr>

      {/* Expanded: per-invoice breakdown */}
      {open && (
        <tr>
          <td colSpan={7} className="bg-gray-50 px-6 pb-4 pt-2 border-b border-gray-200">

            {/* Invoice table */}
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Invoices — click a row to see which bank deposits cover it
            </p>
            <table className="w-full text-xs mb-4">
              <thead>
                <tr className="text-gray-400 text-left">
                  <th className="w-5" />
                  <th className="pb-1 pr-3">Invoice No.</th>
                  <th className="pb-1 pr-3">Date</th>
                  <th className="pb-1 pr-3">Product</th>
                  <th className="pb-1 pr-3 text-right">Invoiced</th>
                  <th className="pb-1 pr-3 text-right">Received</th>
                  <th className="pb-1 pr-3 text-right">Outstanding</th>
                  <th className="pb-1">Status</th>
                </tr>
              </thead>
              <tbody>
                {(row.invoices ?? []).map((inv: any, i: number) => (
                  <InvoiceRow key={i} inv={inv} />
                ))}
              </tbody>
            </table>

          </td>
        </tr>
      )}
    </>
  );
}

// ── Excel export ──────────────────────────────────────────────────────────────

function buildExcelExport(report: any, depositSource: 'excel' | 'csv', filterCompany: string) {
  const wb          = XLSX.utils.book_new();
  const sourceLabel = depositSource === 'excel' ? 'Excel Deposits' : 'Bank Statement CSVs';
  const generatedAt = new Date().toLocaleString('en-AE');
  const USD_RATE    = 3.6725;
  const EUR_RATE    = 4.08;
  const BASE_SZ     = 11;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toTitleCase = (s: string) =>
    s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  // ── Shared style helpers ──────────────────────────────────────────────────
  const sf   = (rgb: string) => ({ patternType: 'solid', fgColor: { rgb } });
  const mon  = (extra: any = {}) => ({ numFmt: '#,##0.00', alignment: { horizontal: 'right' }, font: { sz: BASE_SZ }, ...extra });
  const monG = mon({ font: { color: { rgb: '375623' }, sz: BASE_SZ } });
  const monR = mon({ font: { color: { rgb: 'C00000' }, sz: BASE_SZ } });

  const COL_HDR: any = {
    fill: sf('1F4E79'),
    font: { bold: true, color: { rgb: 'FFFFFF' }, sz: BASE_SZ },
    alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  };
  const CUST_S: any = {
    fill: sf('D6DCE4'),
    font: { bold: true, sz: BASE_SZ + 1 },
    alignment: { vertical: 'center' },
  };
const STATUS_S: Record<string, any> = {
    paid:     { fill: sf('92D050'), font: { bold: true, color: { rgb: '375623' }, sz: BASE_SZ }, alignment: { horizontal: 'center' } },
    partial:  { fill: sf('FFD966'), font: { bold: true, color: { rgb: '7F6000' }, sz: BASE_SZ }, alignment: { horizontal: 'center' } },
    unpaid:   { fill: sf('FF4C4C'), font: { bold: true, color: { rgb: 'FFFFFF' }, sz: BASE_SZ }, alignment: { horizontal: 'center' } },
    overpaid: { fill: sf('9DC3E6'), font: { bold: true, color: { rgb: '1F4E79' }, sz: BASE_SZ }, alignment: { horizontal: 'center' } },
  };
  const ROW_FILL: Record<string, any> = {
    paid: sf('EBF5E1'), partial: sf('FFF8DC'), unpaid: sf('FDECEA'), overpaid: sf('DEEAF1'),
  };
  const META_TITLE: any = { font: { bold: true, sz: 14 } };
  const META_SUB: any   = { font: { sz: BASE_SZ, italic: true, color: { rgb: '595959' } } };
  const FX_NOTE: any    = { font: { sz: BASE_SZ, italic: true, color: { rgb: '7030A0' } } };

  // ── Cell / row builders ───────────────────────────────────────────────────
  const mk  = (v: any, s: any = {}): any => {
    if (v === null || v === undefined || v === '') return { v: '', t: 's', s };
    return { v, t: typeof v === 'number' ? 'n' : 's', s };
  };
  const em  = (s: any = {}) => ({ v: '', t: 's', s });
  const bl  = (n: number, s: any = {}) => Array.from({ length: n }, () => em(s));

  const statusLabel = (st: string) =>
    ({ paid: 'Paid', partial: 'Partial', unpaid: 'Unpaid', overpaid: 'Need Invoice' }[st] ?? st);
  const custRemarks = (c: any) =>
    c.status === 'paid'     ? 'Fully paid'
    : c.status === 'partial'? `Partially paid — ${Number(c.total_outstanding).toLocaleString('en-AE', { minimumFractionDigits: 2 })} AED outstanding`
    : c.status === 'unpaid' ? 'No payments found'
    : 'Excess payment — raise new invoice';
  const invRemarks = (inv: any) =>
    inv.status === 'paid'    ? 'Fully paid'
    : inv.status === 'partial'? `Partially paid — ${Number(inv.outstanding).toLocaleString('en-AE', { minimumFractionDigits: 2 })} AED remaining`
    : inv.status === 'unpaid' ? 'Unpaid'
    : 'Need invoice';

  function toSheet(rows: any[][], colWidths: number[]): any {
    const ws: any = {};
    const nCols = colWidths.length;
    for (let r = 0; r < rows.length; r++)
      for (let c = 0; c < nCols; c++)
        ws[XLSX.utils.encode_cell({ r, c })] = rows[r]?.[c] ?? em();
    ws['!ref']  = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length - 1, c: nCols - 1 } });
    ws['!cols'] = colWidths.map(w => ({ wch: w }));
    return ws;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 2 — built first so we can capture row positions for Sheet 1 links
  // Columns (11):
  //  A:Date | B:Description | C:Voucher | D:Account | E:Bank
  //  F:Deposit Amt | G:Currency | H:Rate | I:AED Equiv | J:Applied | K:Inv Balance
  // ══════════════════════════════════════════════════════════════════════════
  const P            = 11;
  const accountLbl   = depositSource === 'csv' ? 'CSV Account' : 'Bank Account';
  const custRowMap   = new Map<string, number>();   // customer_name → s2 row index
  const invRowMap    = new Map<string, number>();   // `custName|invId` → s2 row index

  const s2: any[][] = [];
  s2.push([mk('Payment Transactions', META_TITLE),                           ...bl(P - 1)]);
  s2.push([mk(`Deposit Source: ${sourceLabel}`, META_SUB),                   ...bl(P - 1)]);
  s2.push([mk(`Generated: ${generatedAt}`, META_SUB),                        ...bl(P - 1)]);
  s2.push([mk('Columns F–I show payment details. For non-AED deposits, the original amount is in column F, the exchange rate used in H, and the AED equivalent in I.', FX_NOTE), ...bl(P - 1)]);
  s2.push([mk(`Exchange rates: 1 USD = ${USD_RATE} AED   |   1 EUR = ${EUR_RATE} AED   (columns H & I highlighted in purple for converted amounts)`, FX_NOTE), ...bl(P - 1)]);
  s2.push(bl(P));

  s2.push([
    mk('Date', COL_HDR), mk('Description', COL_HDR), mk('Voucher No.', COL_HDR),
    mk(accountLbl, COL_HDR), mk('Bank', COL_HDR),
    mk('Deposit Amt (orig.)', COL_HDR), mk('Currency', COL_HDR),
    mk('Rate (→ AED)', COL_HDR), mk('AED Equivalent', COL_HDR),
    mk('Applied to Invoice (AED)', COL_HDR), mk('Invoice Balance After (AED)', COL_HDR),
  ]);

  for (const cust of (report.customers ?? [])) {
    // ── Customer header ──────────────────────────────────────────────────
    custRowMap.set(cust.customer_name, s2.length);
    s2.push([
      em(CUST_S),
      mk(cust.customer_name,                       { ...CUST_S, font: { bold: true, sz: BASE_SZ + 2 } }),
      mk(toTitleCase(cust.source_company ?? ''), CUST_S),
      em(CUST_S), em(CUST_S), em(CUST_S), em(CUST_S), em(CUST_S), em(CUST_S),
      mk(parseFloat(cust.total_received    ?? 0), { ...CUST_S, ...monG, font: { bold: true, color: { rgb: '375623' }, sz: BASE_SZ + 1 } }),
      mk(parseFloat(cust.total_outstanding ?? 0), { ...CUST_S, ...monR, font: { bold: true, color: { rgb: cust.total_outstanding > 0 ? 'C00000' : '375623' }, sz: BASE_SZ + 1 } }),
    ]);

    for (const inv of (cust.invoices ?? [])) {
      const rf  = ROW_FILL[inv.status] ?? {};
      const is  = STATUS_S[inv.status] ?? {};

      // ── Invoice header row ─────────────────────────────────────────────
      invRowMap.set(`${cust.customer_name}|${inv.id}`, s2.length);
      s2.push([
        mk(inv.invoice_date ? String(inv.invoice_date).substring(0, 10) : '', { fill: rf, font: { bold: true, sz: BASE_SZ }, alignment: { horizontal: 'center' } }),
        mk(`  ${inv.product || '—'}`,     { fill: rf, font: { bold: true, sz: BASE_SZ } }),
        mk(inv.voucher_no || '',          { fill: rf, font: { bold: true, sz: BASE_SZ } }),
        em({ fill: rf }), em({ fill: rf }),
        mk(parseFloat(inv.gross_total ?? 0), { fill: rf, ...mon({ font: { bold: true, sz: BASE_SZ } }) }),
        em({ fill: rf }), em({ fill: rf }), em({ fill: rf }),
        mk(parseFloat(inv.received   ?? 0), { fill: rf, ...mon({ font: { bold: true, color: { rgb: '375623' }, sz: BASE_SZ } }) }),
        mk(statusLabel(inv.status),          { fill: rf, ...is }),
      ]);

      // ── Payment rows ───────────────────────────────────────────────────
      let runBal = parseFloat(inv.gross_total ?? 0);
      for (const t of (inv.transactions ?? [])) {
        const applied  = parseFloat(t.applied  ?? 0);
        const origAmt  = parseFloat(t.deposit  ?? 0);
        const isAED    = !t.currency || t.currency === 'AED';
        const rate     = t.currency === 'USD' ? USD_RATE : t.currency === 'EUR' ? EUR_RATE : null;
        const aedEquiv = parseFloat(t.deposit_aed ?? t.deposit ?? 0);
        runBal = parseFloat((runBal - applied).toFixed(2));

        s2.push([
          mk(t.date ? String(t.date).substring(0, 10) : '',   { font: { sz: BASE_SZ }, alignment: { horizontal: 'center' } }),
          mk(`      ${t.particular || ''}`,                    { font: { sz: BASE_SZ } }),
          em(),
          mk(t.account_name || '',                             { font: { sz: BASE_SZ } }),
          mk(t.bank_name    || '',                             { font: { sz: BASE_SZ } }),
          mk(origAmt,                                          mon()),
          mk(t.currency || 'AED', {
            font: { sz: BASE_SZ, bold: !isAED, color: !isAED ? { rgb: '7030A0' } : undefined },
            alignment: { horizontal: 'center' },
          }),
          rate
            ? mk(rate,     { numFmt: '0.0000', alignment: { horizontal: 'center' }, font: { sz: BASE_SZ, italic: true, color: { rgb: '7030A0' } } })
            : em(),
          !isAED
            ? mk(aedEquiv, { ...mon(), font: { sz: BASE_SZ, italic: true, color: { rgb: '7030A0' } } })
            : em(),
          mk(applied,  { ...mon(), font: { bold: true, color: { rgb: '1F497D' }, sz: BASE_SZ } }),
          mk(runBal,   runBal <= 0
            ? { ...mon(), font: { bold: true, color: { rgb: '375623' }, sz: BASE_SZ } }
            : { ...mon(), font: { color: { rgb: 'C00000' }, sz: BASE_SZ } }),
        ]);
      }

      // ── Invoice subtotal row ───────────────────────────────────────────
      if ((inv.transactions ?? []).length > 0) {
        const SUB: any = { font: { italic: true, sz: BASE_SZ, color: { rgb: '595959' } } };
        s2.push([
          em(SUB), mk('      Total applied to this invoice', SUB),
          em(SUB), em(SUB), em(SUB), em(SUB), em(SUB), em(SUB), em(SUB),
          mk(parseFloat(inv.received    ?? 0), { ...mon(), font: { bold: true, italic: true, sz: BASE_SZ } }),
          mk(`Outstanding: ${Number(inv.outstanding ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })} AED`, SUB),
        ]);
      }

      s2.push(bl(P)); // spacer between invoices
    }

    s2.push(bl(P)); // spacer between customers
  }

  const ws2 = toSheet(s2, [14, 46, 18, 28, 18, 18, 11, 14, 18, 22, 22]);

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 1 — Invoice Summary  (customer header + invoice rows + hyperlinks)
  // ══════════════════════════════════════════════════════════════════════════
  const N  = 10;
  const s1: any[][] = [];

  s1.push([mk('Invoice & Payment Summary', META_TITLE),                                             ...bl(N - 1)]);
  s1.push([mk(`Deposit Source: ${sourceLabel}`, META_SUB),                                          ...bl(N - 1)]);
  s1.push([mk(`Company Filter: ${filterCompany ? toTitleCase(filterCompany) : 'All Companies'}`, META_SUB), ...bl(N - 1)]);
  s1.push([mk(`Generated: ${generatedAt}`, META_SUB),                                               ...bl(N - 1)]);
  s1.push(bl(N));
  s1.push([
    mk('Date', COL_HDR), mk('Customer / Product', COL_HDR), mk('Source Company', COL_HDR),
    mk('Voucher No.', COL_HDR), mk('Invoice Count', COL_HDR),
    mk('Gross Total (AED)', COL_HDR), mk('Received (AED)', COL_HDR), mk('Outstanding (AED)', COL_HDR),
    mk('Status', COL_HDR), mk('Remarks', COL_HDR),
  ]);

  // Track Sheet 1 row positions so we can add hyperlinks after the loop
  const s1CustPositions: { name: string; row: number }[]        = [];
  const s1InvPositions:  { name: string; id: any; row: number }[] = [];

  for (const cust of (report.customers ?? [])) {
    const ss        = STATUS_S[cust.status] ?? {};
    const dateRange = cust.first_invoice
      ? cust.first_invoice !== cust.last_invoice
        ? `${String(cust.first_invoice).substring(0, 10)} – ${String(cust.last_invoice).substring(0, 10)}`
        : String(cust.first_invoice).substring(0, 10)
      : '';

    s1CustPositions.push({ name: cust.customer_name, row: s1.length });
    s1.push([
      mk(dateRange,                                              CUST_S),
      mk(cust.customer_name,                                     { ...CUST_S, font: { bold: true, sz: BASE_SZ + 2 } }),
      mk(toTitleCase(cust.source_company ?? ''),        CUST_S),
      em(CUST_S),
      mk(`${cust.invoice_count} invoice${cust.invoice_count !== 1 ? 's' : ''}`, { ...CUST_S, alignment: { horizontal: 'center', vertical: 'center' } }),
      mk(parseFloat(cust.total_invoiced    ?? 0), { ...CUST_S, ...mon() }),
      mk(parseFloat(cust.total_received    ?? 0), { ...CUST_S, ...monG, font: { bold: true, color: { rgb: '375623' }, sz: BASE_SZ + 1 } }),
      mk(parseFloat(cust.total_outstanding ?? 0), { ...CUST_S, ...(cust.total_outstanding > 0 ? monR : mon()), font: { bold: true, color: { rgb: cust.total_outstanding > 0 ? 'C00000' : '375623' }, sz: BASE_SZ + 1 } }),
      mk(statusLabel(cust.status),                { ...CUST_S, ...ss }),
      mk(custRemarks(cust),                        CUST_S),
    ]);

    for (const inv of (cust.invoices ?? [])) {
      const rf = ROW_FILL[inv.status] ?? {};
      const is = STATUS_S[inv.status] ?? {};
      const iS = (extra: any = {}) => ({ fill: rf, font: { sz: BASE_SZ }, ...extra });

      s1InvPositions.push({ name: cust.customer_name, id: inv.id, row: s1.length });
      s1.push([
        mk(inv.invoice_date ? String(inv.invoice_date).substring(0, 10) : '', iS({ alignment: { horizontal: 'center' } })),
        mk(`    ${inv.product || '—'}`,     iS()),
        em(iS()),
        mk(inv.voucher_no || '',            iS({ font: { sz: BASE_SZ, color: { rgb: '1F497D' }, underline: true } })),
        em(iS()),
        mk(parseFloat(inv.gross_total  ?? 0), iS(mon())),
        mk(parseFloat(inv.received     ?? 0), iS({ ...monG })),
        mk(parseFloat(inv.outstanding  ?? 0), iS(inv.outstanding > 0 ? monR : mon())),
        mk(statusLabel(inv.status),           { fill: rf, ...is }),
        mk(invRemarks(inv),                   iS()),
      ]);
    }

    s1.push(bl(N));
  }

  const ws1 = toSheet(s1, [22, 50, 20, 20, 15, 22, 22, 22, 14, 44]);

  // ── Hyperlinks: Sheet 1 → Sheet 2 ────────────────────────────────────────
  for (const { name, row } of s1CustPositions) {
    const s2row = custRowMap.get(name);
    if (s2row !== undefined) {
      const addr = XLSX.utils.encode_cell({ r: row, c: 6 }); // col G = Received
      if (ws1[addr]) ws1[addr].l = { Target: `#'Payment Transactions'!A${s2row + 1}`, Tooltip: 'View payment breakdown in Sheet 2' };
    }
  }
  for (const { name, id, row } of s1InvPositions) {
    const s2row = invRowMap.get(`${name}|${id}`);
    if (s2row !== undefined) {
      const addr = XLSX.utils.encode_cell({ r: row, c: 3 }); // col D = Voucher No
      if (ws1[addr]) ws1[addr].l = { Target: `#'Payment Transactions'!A${s2row + 1}`, Tooltip: 'View payment detail in Sheet 2' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SHEET 3 — Uninvoiced Deposits
  // ══════════════════════════════════════════════════════════════════════════
  const U  = 6;
  const s3: any[][] = [];
  s3.push([mk('Deposits Without Invoice', META_TITLE),    ...bl(U - 1)]);
  s3.push([mk(`Generated: ${generatedAt}`, META_SUB),     ...bl(U - 1)]);
  s3.push(bl(U));
  s3.push([
    mk('Sr. No.', COL_HDR), mk('Account', COL_HDR), mk('Bank', COL_HDR),
    mk('Date', COL_HDR), mk('Deposit (AED)', COL_HDR), mk('Description', COL_HDR),
  ]);
  (report.uninvoiced_deposits ?? []).forEach((r: any, idx: number) => {
    s3.push([
      mk(idx + 1, { font: { sz: BASE_SZ }, alignment: { horizontal: 'center' } }),
      mk(r.account_name || '',  { font: { sz: BASE_SZ } }),
      mk(r.bank_name    || '',  { font: { sz: BASE_SZ } }),
      mk(r.date ? String(r.date).substring(0, 10) : '', { font: { sz: BASE_SZ }, alignment: { horizontal: 'center' } }),
      mk(parseFloat(r.deposit ?? 0), mon()),
      mk(r.particular || '',    { font: { sz: BASE_SZ } }),
    ]);
  });
  const ws3 = toSheet(s3, [8, 34, 22, 14, 20, 58]);

  // ── Append & download ─────────────────────────────────────────────────────
  XLSX.utils.book_append_sheet(wb, ws1, 'Invoice Summary');
  XLSX.utils.book_append_sheet(wb, ws2, 'Payment Transactions');
  XLSX.utils.book_append_sheet(wb, ws3, 'Uninvoiced Deposits');

  const datePart = new Date().toISOString().substring(0, 10);
  const compPart = filterCompany ? `_${filterCompany}` : '';
  const srcPart  = depositSource === 'csv' ? '_csv' : '_excel';
  XLSX.writeFile(wb, `invoice_matching${compPart}${srcPart}_${datePart}.xlsx`);
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function InvoiceMatching() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [search, setSearch] = useState('');
  const [report, setReport] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'customers' | 'uninvoiced'>('customers');
  const [depositSource, setDepositSource] = useState<'excel' | 'csv'>(
    () => (localStorage.getItem('invoiceDepositSource') as 'excel' | 'csv') || 'excel'
  );
  const loadSeq = useRef(0);

  useEffect(() => {
    getSalesCompanies().then(r => setCompanies(r.data));
    load();
  }, []);

  const load = async (company?: string, source?: 'excel' | 'csv') => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const res = await getSalesCustomerSummary(company || undefined, source ?? depositSource);
      if (seq !== loadSeq.current) return; // discard stale response
      setReport(res.data);
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  };

  const handleCompanyChange = (v: string) => { setFilterCompany(v); load(v || undefined, depositSource); };

  const handleSourceToggle = (src: 'excel' | 'csv') => {
    setDepositSource(src);
    localStorage.setItem('invoiceDepositSource', src);
    load(filterCompany || undefined, src);
  };

  const customers: any[] = report?.customers ?? [];
  const uninvoiced: any[] = report?.uninvoiced_deposits ?? [];
  const summary = report?.summary ?? {};

  const displayCustomers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter(r => {
      if (filterStatus && r.status !== filterStatus) return false;
      if (q && !(r.customer_name ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [customers, filterStatus, search]);

  if (!report && !loading) {
    return (
      <Layout>
        <PageHeader title="Invoice & Payment Summary" subtitle="Track money owed and payments without invoices" />
        <div className="p-8 text-center text-gray-400 text-sm">
          No sales invoices imported yet. Upload the sales register files on the Import page.
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader
        title="Invoice & Payment Summary"
        subtitle="Per-customer: total invoiced vs received. Expand a customer to see per-invoice FIFO breakdown."
      />
      <div className="p-8 space-y-6">

        {/* Deposit source toggle */}
        <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
          {(['excel', 'csv'] as const).map(src => (
            <button
              key={src}
              onClick={() => handleSourceToggle(src)}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                depositSource === src
                  ? 'bg-white text-blue-700 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {src === 'excel' ? 'Excel deposits' : 'Bank statement CSVs'}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterCompany} onChange={e => handleCompanyChange(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All companies</option>
            {companies.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All statuses</option>
            <option value="unpaid">Unpaid</option>
            <option value="partial">Partially paid</option>
            <option value="paid">Paid</option>
            <option value="overpaid">Need invoice</option>
          </select>
          {(filterCompany || filterStatus) && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterCompany(''); setFilterStatus(''); load(undefined, depositSource); }}>
              Clear
            </Button>
          )}
          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="text" placeholder="Search customer…" value={search} onChange={e => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          {report && (
            <button
              onClick={() => buildExcelExport(report, depositSource, filterCompany)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Download size={14} />
              Download
            </button>
          )}
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-5 gap-4">
          {[
            { label: 'Total invoiced',       value: fmtNum(summary.total_invoiced) },
            { label: 'Total received',        value: fmtNum(summary.total_received),    ok: true },
            { label: 'Still outstanding',     value: fmtNum(summary.total_outstanding), highlight: (summary.total_outstanding ?? 0) > 0 },
            { label: 'Customers unpaid',      value: summary.customers_unpaid ?? '—',   highlight: (summary.customers_unpaid ?? 0) > 0 },
            { label: 'Deposits w/o invoice',  value: summary.uninvoiced_deposit_count ?? '—', warn: (summary.uninvoiced_deposit_count ?? 0) > 0 },
          ].map(({ label, value, highlight, ok, warn }) => (
            <div key={label} className={`rounded-xl border px-5 py-4 ${highlight ? 'bg-red-50 border-red-200' : ok ? 'bg-green-50 border-green-200' : warn ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-200'}`}>
              <p className={`text-xl font-bold ${highlight ? 'text-red-700' : ok ? 'text-green-700' : warn ? 'text-amber-700' : 'text-gray-900'}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-200">
          {(['customers', 'uninvoiced'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {tab === 'customers'
                ? `Customers (${displayCustomers.length})`
                : `Transactions requiring invoice (${uninvoiced.length})`}
            </button>
          ))}
        </div>

        {/* Customers table */}
        {activeTab === 'customers' && (
          <Card>
            <CardHeader>
              <p className="font-medium text-gray-900 text-sm">
                Click a customer to expand invoices · click an invoice to see which deposits cover it
              </p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="w-6" />
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Customer</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Source</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Total invoiced</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Total received</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Outstanding</th>
                    <th className="px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {loading && (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">Loading…</td></tr>
                  )}
                  {!loading && displayCustomers.map((row, i) => <CustomerRow key={i} row={row} />)}
                  {!loading && displayCustomers.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No customers found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Uninvoiced deposits tab */}
        {activeTab === 'uninvoiced' && (
          <Card>
            <CardHeader>
              <p className="font-medium text-gray-900 text-sm">
                Large deposits (≥50k) from entities not in the sales register — potential invoices to raise
              </p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    <th className="px-5 py-3 text-xs font-medium text-gray-500">Account</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500">Bank</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500">Date</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500 text-right">Deposit</th>
                    <th className="px-5 py-3 text-xs font-medium text-gray-500">Description</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {uninvoiced.map((r: any, i: number) => (
                    <tr key={i} className="hover:bg-gray-50 bg-amber-50/20">
                      <td className="px-5 py-3 text-gray-700">{r.account_name}</td>
                      <td className="px-5 py-3 text-gray-500">{r.bank_name}</td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(r.date)}</td>
                      <td className="px-5 py-3 text-right font-mono font-semibold text-gray-800">{fmtNum(r.deposit)}</td>
                      <td className="px-5 py-3 text-gray-400 max-w-xs">
                        <span className="block truncate text-xs" title={r.particular}>{r.particular}</span>
                      </td>
                    </tr>
                  ))}
                  {uninvoiced.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No uninvoiced deposits found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </Layout>
  );
}
