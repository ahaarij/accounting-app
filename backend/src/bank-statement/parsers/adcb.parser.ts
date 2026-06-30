import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText, ensureNewestFirst } from './types';

const MONTH_MAP: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseADCBDate(raw: string): string | null {
  // DD-Mon-YYYY (e.g. 01-Jan-2026)
  const m = raw.trim().match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mo = MONTH_MAP[m[2].toLowerCase()];
  return mo ? `${m[3]}-${mo}-${m[1].padStart(2, '0')}` : null;
}

export function parseADCB(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  // ── Header ────────────────────────────────────────────────────────────────
  const accountNumMatch = fullText.match(/Account No\.\s*:\s*(\d+)\s*-\s*(?:AED|USD|EUR)/i);
  const accountNumber = accountNumMatch?.[1] ?? 'UNKNOWN';
  const iban = fullText.match(/\b(AE\d{2}[0-9]{20})\b/)?.[1] ?? null;
  const holderName = fullText.match(/Account Name\s*:\s*([A-Z][A-Z \n]+?)\s*(?:IBAN|Average|$)/i)?.[1]
    ?.replace(/\s+/g, ' ').trim()
    ?? fullText.match(/([A-Z][A-Z ]+(?:LLC|FZE|LTD|IND|CO|WLL))\b/)?.[1]?.trim()
    ?? 'UNKNOWN';
  const currency = fullText.match(/Account No\.\s*:\s*\d+\s*-\s*(AED|USD|EUR)/i)?.[1] ?? 'AED';

  const startDateMatch = fullText.match(/Start Date:\s*(\d{2}-[A-Za-z]{3}-\d{4})/i);
  const endDateMatch = fullText.match(/End Date:\s*(\d{2}-[A-Za-z]{3}-\d{4})/i);
  const periodFrom = startDateMatch ? parseADCBDate(startDateMatch[1]) : null;
  const periodTo = endDateMatch ? parseADCBDate(endDateMatch[1]) : null;

  const openingMatch = fullText.match(/Opening Balance:\s*([\d,]+\.\d{2})/i);
  const closingMatch = fullText.match(/Closing\(Available\) Balance:\s*([\d,]+\.\d{2})/i);
  const openingBalance = openingMatch ? parseNum(openingMatch[1]) : null;
  const closingBalance = closingMatch ? parseNum(closingMatch[1]) : null;

  // ── Transaction blocks ────────────────────────────────────────────────────
  // Blocks start with: {sr_no}  {DD-Mon-YYYY}  (rest of data follows)
  const TX_START = /^(\d+)\s+(\d{2}-[A-Za-z]{3}-\d{4})\b/;
  // Amounts line (last line of each block):
  // {debit_or_dash}  {credit_or_dash}  {running_balance}
  const AMOUNTS_RE = /(?:([\d,]+\.\d{2})|-)\s+(?:([\d,]+\.\d{2})|-)\s+([\d,]+\.\d{2})\s*$/;
  // DD-Mon-YYYY pattern for stripping dates from description
  const DATE_RE = /\d{2}-[A-Za-z]{3}-\d{4}/g;

  const transactions: ParsedTransaction[] = [];
  let blockLines: string[] = [];

  const flushBlock = () => {
    if (blockLines.length === 0) return;

    const blockText = blockLines.join(' ');

    // Extract two dates: first = transaction date, second = value date
    const dates = [...blockText.matchAll(/\d{2}-[A-Za-z]{3}-\d{4}/g)].map(m => m[0]);
    const date = dates[0] ? parseADCBDate(dates[0]) : null;
    const valueDate = dates[1] ? parseADCBDate(dates[1]) : null;
    if (!date) return;

    // Amounts: find the pattern in the LAST non-empty block line
    const lastLine = blockLines[blockLines.length - 1].trim();
    const amtM = lastLine.match(AMOUNTS_RE);
    if (!amtM) return;

    const debit = amtM[1] ? parseNum(amtM[1]) : null;
    const credit = amtM[2] ? parseNum(amtM[2]) : null;
    const balance = parseNum(amtM[3]);

    // Description: join all block lines, strip sr_no, dates, reference codes, amounts
    let desc = blockText
      .replace(/^\d+\s+/, '')                  // strip leading sr_no
      .replace(DATE_RE, '')                     // strip DD-Mon-YYYY dates
      .replace(AMOUNTS_RE, '')                  // strip amounts at end
      .replace(/\bPHUB\S+\b/g, '')             // strip PHUB... bank refs
      .replace(/\bCHRG\S+\b/g, '')             // strip CHRG... charge refs
      .replace(/\b\d{6,}\b/g, '')              // strip long numeric refs
      .replace(/\s+/g, ' ')
      .trim();

    // Remove leading period or dot (customer ref ".")
    desc = desc.replace(/^\.\s*/, '');

    const cls = classifyADCB(desc, debit, credit);

    transactions.push({
      date,
      value_date: valueDate,
      narration: cleanText(desc),
      counterparty: cls.counterparty,
      transaction_type: cls.type,
      reference: null,
      charge_ref: null,
      debit,
      credit,
      running_balance: balance,
      is_charge: cls.isCharge,
      fx_rate: null,
      fx_original_amount: null,
      fx_original_currency: null,
    });

    blockLines = [];
  };

  let inTxSection = false;
  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Sr.No header marks start of transaction table on each page
    if (/^Sr\.No\s+Date/i.test(line)) {
      inTxSection = true;
      continue;
    }
    // Page headers and footers
    if (/^Page\s+\d+\s+of\s+\d+/i.test(line) || /^Report Date:/i.test(line)) {
      continue;
    }

    if (!inTxSection) continue;

    if (TX_START.test(line)) {
      flushBlock();
      blockLines = [line];
    } else if (blockLines.length > 0 && line) {
      blockLines.push(line);
    }
  }
  flushBlock();

  ensureNewestFirst(transactions);

  const account: ParsedAccount = {
    iban,
    account_number: accountNumber,
    holder_name: cleanText(holderName),
    bank_name: 'Abu Dhabi Commercial Bank',
    currency,
    opening_balance: openingBalance,
    closing_balance: closingBalance,
    period_from: periodFrom,
    period_to: periodTo,
  };

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
}

// ── Classifier ────────────────────────────────────────────────────────────────

interface ADCBClassified {
  type: string;
  counterparty: string | null;
  isCharge: boolean;
}

function classifyADCB(desc: string, debit: number | null, credit: number | null): ADCBClassified {
  // Bank charges / fees
  if (/ProCash Monthly Maintenance Fee|MONTHLY MAINTENANCE/i.test(desc)) {
    return { type: 'MONTHLY_CHARGE', counterparty: null, isCharge: true };
  }
  if (/O\/W CORR BK CHARGE|CORRESPONDENT BANK CHARGE/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/CHARGE|FEE|LEVY/i.test(desc) && !/TRADING|GENERAL/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }

  // Inward transfers — B/O (Beneficiary Order from another party)
  if (/^B\/O\s+/i.test(desc)) {
    const cp = desc.replace(/^B\/O\s+/i, '').split(/\s{2,}/)[0].trim();
    return { type: 'INWARD_TRANSFER', counterparty: cp || null, isCharge: false };
  }

  // Outward transfers
  if (/^O\/W TRF|^O\/W TRANSFER/i.test(desc)) {
    return { type: 'OUTWARD_TRANSFER', counterparty: null, isCharge: false };
  }

  // Card / POS purchases
  if (/^PUR\s+\d{2}\/\d{2}/i.test(desc)) {
    const merchant = desc.replace(/^PUR\s+\d{2}\/\d{2}\s+/i, '').replace(/\s*3113\s*$/, '').trim();
    return { type: 'OUTWARD_TRANSFER', counterparty: merchant || null, isCharge: false };
  }

  // Cheque transactions
  if (/CHEQUE DEPOSIT|INHOUSE CHEQUE/i.test(desc)) {
    return { type: 'CHEQUE_DEPOSIT', counterparty: null, isCharge: false };
  }
  if (/CHEQUE RETURN|RETURNED CHEQUE/i.test(desc)) {
    return { type: 'RETURNED_CHEQUE', counterparty: null, isCharge: false };
  }

  // Default by direction
  return {
    type: credit ? 'INWARD_TRANSFER' : 'OUTWARD_TRANSFER',
    counterparty: null,
    isCharge: false,
  };
}
