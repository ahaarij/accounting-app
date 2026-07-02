import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText } from './types';

const MONTH_ABBR: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseNBFDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTH_ABBR[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
}

export function parseNBF(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n').map(l => l.trim());

  // ── Header extraction ─────────────────────────────────────────────────────
  const get = (re: RegExp) => { const m = fullText.match(re); return m ? m[1].trim() : null; };

  // \S+ would grab the next label if IBAN and Account: run together on one line (no space)
  const iban = get(/IBAN Number:\s*(AE\d{21})/i) ?? null;

  const acctMatch = fullText.match(/Account:\s*(\S+)\((\w+)\)\s*-\s*(.+)/i);
  const accountNumber = acctMatch ? acctMatch[1] : (get(/Account[:\s]+(\S+)/i) ?? 'UNKNOWN');
  const currency = acctMatch ? acctMatch[2].toUpperCase() : 'AED';
  const holderName = acctMatch ? cleanText(acctMatch[3]) : 'UNKNOWN';

  const openingBalance = parseNum(get(/Opening Balance:\s*(?:AED\s*)?([\d,]+\.?\d*)/i));
  const closingBalance = parseNum(get(/Closing Balance:\s*(?:AED\s*)?([\d,]+\.?\d*)/i));

  const account: ParsedAccount = {
    iban,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'National Bank of Fujairah',
    currency,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    period_from: null,
    period_to: null,
  };

  // ── Transaction parsing ───────────────────────────────────────────────────
  // NBF PDF layout: Date | Description | Reference | Credit | Balance | Debit
  // PyPDF2 extracts right columns (Balance, Debit or Credit) first, before text.
  //
  // Each line in extracted text:
  //   {Date DD Mon YYYY} {Balance} {Amount} {Description} {Reference} |{Counterparty}| ...
  //
  // The Balance is always first (it appears in the leftmost position of the right columns).
  // The Amount is either a debit or credit depending on direction, determined from description.
  // NBF statements are newest-first; balance shown is AFTER the transaction.

  const DATE_START = /^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s+(.*)/;
  const transactions: ParsedTransaction[] = [];

  let firstDate: string | null = null;
  let lastDate: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(DATE_START);
    if (!m) continue;

    const date = parseNBFDate(m[1]);
    if (!date) continue;

    if (!firstDate) firstDate = date;
    lastDate = date;

    // Accumulate continuation lines — NBF wraps company names to the next line
    let rest = m[2];
    while (i + 1 < lines.length && !lines[i + 1].match(DATE_START)) {
      i++;
      rest += ' ' + lines[i];
    }
    rest = rest.trim();

    // NBF PDF column layout: Date | Description | Reference | Credit | Balance | Debit
    // pdf-parse extracts right columns first, using different separators per direction:
    //   Debit row:  {balance}\t{debit_amount}\t{description...}   (tab between numbers)
    //   Credit row: {credit_amount} {balance}\t{description...}   (space between numbers)
    // This separator pattern is reliable across all transaction types (including Account Transfer).
    const tabSep = rest.match(/^(-?[\d,]+\.\d{2})\t(-?[\d,]+\.\d{2})[\t ]+(.*)/s);
    const spaceSep = rest.match(/^(-?[\d,]+\.\d{2}) (-?[\d,]+\.\d{2})\t(.*)/s);

    let balance: number | null = null;
    let debit: number | null = null;
    let credit: number | null = null;
    let textPart: string;

    if (tabSep) {
      // Debit: n1=balance after tx, n2=debit amount
      balance = parseNum(tabSep[1]);
      debit = parseNum(tabSep[2]) || null;
      textPart = tabSep[3];
    } else if (spaceSep) {
      // Credit: n1=credit amount, n2=balance after tx
      credit = parseNum(spaceSep[1]) || null;
      balance = parseNum(spaceSep[2]);
      textPart = spaceSep[3];
    } else {
      // Fallback: single number or ambiguous whitespace
      const singleNum = rest.match(/^(-?[\d,]+\.\d{2})\s+(.*)/s);
      if (singleNum) {
        balance = parseNum(singleNum[1]);
        textPart = singleNum[2];
      } else {
        textPart = rest;
      }
    }

    // Outward: |COMPANY NAME|SW-BIC  — two pipes
    // Inward:  AE...IBAN|BANK NAME   — single pipe after IBAN/account
    const pipeMatch = textPart.match(/\|([^|]+)\|/)
      ?? textPart.match(/\b(?:AE\d{20,}|\d{10,})\|([^|\n]+)/);
    const counterparty = pipeMatch ? cleanText(pipeMatch[pipeMatch[1] ? 1 : 2] ?? pipeMatch[1]) : null;

    // Extract FT reference
    const refMatch = textPart.match(/\b(FT[A-Z0-9]{6,})\b/i);
    const reference = refMatch ? refMatch[1].toUpperCase() : null;

    // Build clean description: strip pipe section, FT refs, account numbers, BIC codes
    const cleanDesc = textPart
      .replace(/\|[^|]*\|/g, '')
      .replace(/\b(FT[A-Z0-9]{6,})\b/gi, '')
      .replace(/\bAC-\d+\b/g, '')
      .replace(/\bSW-[A-Z0-9]+\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();

    const { transaction_type, is_charge } = classifyNBF(textPart);

    transactions.push({
      date,
      value_date: date,
      narration: buildNBFNarration(transaction_type, counterparty, cleanDesc),
      counterparty,
      transaction_type,
      reference,
      charge_ref: reference,
      debit: debit !== null && debit > 0 ? debit : null,
      credit: credit !== null && credit > 0 ? credit : null,
      running_balance: balance,
      is_charge,
      fx_rate: null,
      fx_original_amount: null,
      fx_original_currency: null,
    });
  }

  account.period_from = firstDate;
  account.period_to = lastDate;

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
}

function buildNBFNarration(type: string, counterparty: string | null, fallback: string): string {
  const labels: Record<string, string> = {
    OUTWARD_INTERNATIONAL: 'Outward Swift',
    OUTWARD_TRANSFER: 'Funds Transfer',
    INWARD_TRANSFER: 'Inward',
    INTERNAL_TRANSFER: 'Account Transfer',
    VAT_CHARGE: 'VAT on charges',
    BANK_CHARGE: 'Bank charge',
    CHEQUE_PAID: 'Cheque',
    RETURNED_CHEQUE: 'Returned cheque',
  };
  const label = labels[type] ?? fallback.split(' ').slice(0, 3).join(' ');
  return counterparty ? `${label} · ${counterparty}` : label;
}

function classifyNBF(description: string): { transaction_type: string; is_charge: boolean } {
  if (/Tax\s+Invoice\s+Debit|VAT/i.test(description)) return { transaction_type: 'VAT_CHARGE', is_charge: true };
  if (/Central\s+Bank\s+Transfer\s+Charge|Outward\s+Swift\s+Charges?|Manager\s+Cheque\s+Issue\s+Charge/i.test(description)) return { transaction_type: 'BANK_CHARGE', is_charge: true };
  if (/Outward\s+Swift\s+Payment/i.test(description)) return { transaction_type: 'OUTWARD_INTERNATIONAL', is_charge: false };
  if (/Funds\s+Transfer/i.test(description)) return { transaction_type: 'OUTWARD_TRANSFER', is_charge: false };
  if (/Account\s+Transfer/i.test(description)) return { transaction_type: 'INTERNAL_TRANSFER', is_charge: false };
  if (/MC\s+Issue\s+On\s+Account|Manager\s+Cheque/i.test(description)) return { transaction_type: 'CHEQUE_PAID', is_charge: false };
  if (/Inward\s+Remittance\s+Charge/i.test(description)) return { transaction_type: 'BANK_CHARGE', is_charge: true };
  if (/MC\s+Pay\s+Cancel|Cheque\s+Return/i.test(description)) return { transaction_type: 'INWARD_TRANSFER', is_charge: false };
  if (/Inward|Funds\s+Received/i.test(description)) return { transaction_type: 'INWARD_TRANSFER', is_charge: false };
  return { transaction_type: 'OTHER', is_charge: false };
}
