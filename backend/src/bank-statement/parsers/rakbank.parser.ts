import { ParsedStatement, ParsedAccount, ParsedTransaction, parseNum, cleanText } from './types';

const MONTH_MAP: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseRAKDate(raw: string): string | null {
  // DD-Mon-YYYY (e.g. 01-Dec-2023)
  const m = raw.trim().match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (!m) return null;
  const mo = MONTH_MAP[m[2].toLowerCase()];
  return mo ? `${m[3]}-${mo}-${m[1]}` : null;
}

export function parseRAKBANK(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  // ── Header ────────────────────────────────────────────────────────────────
  const iban = fullText.match(/\b(AE\d{2}[0-9]{20})\b/)?.[1] ?? null;
  const accountNumber = iban ?? fullText.match(/Account Number:\s*([X\d]+)/i)?.[1] ?? 'UNKNOWN';
  const holderName = fullText.match(/^([A-Z][A-Z ]+(?:LLC|FZE|LTD|CO|WLL|BULLIONS|TRADING|GENERAL))\b/m)?.[1]?.trim()
    ?? fullText.match(/([A-Z][A-Z ]+(?:LLC|FZE|LTD|CO|WLL))\b/)?.[1]?.trim()
    ?? 'UNKNOWN';
  const currency = fullText.match(/Currency:\s*(AED|USD|EUR)/i)?.[1] ?? 'AED';

  const periodMatch = fullText.match(/Statement Period:\s*(\d{2}-[A-Za-z]{3}-\d{4})\s+TO\s+(\d{2}-[A-Za-z]{3}-\d{4})/i);
  const periodFrom = periodMatch ? parseRAKDate(periodMatch[1]) : null;
  const periodTo = periodMatch ? parseRAKDate(periodMatch[2]) : null;

  const openingMatch = fullText.match(/Opening Balance\s+(AED\s+)?([\d,]+\.\d{2})/i);
  const openingBalance = openingMatch ? parseNum(openingMatch[2]) : null;

  // ── Transaction blocks ────────────────────────────────────────────────────
  // RAKBANK statements are in REVERSE chronological order.
  // Blocks start with a line beginning with DD-Mon-YYYY.
  // The block ends on the line containing {amount} {balance} Cr./Dr.
  // Strategy: collect all blocks, reverse them, then use balance delta to assign debit/credit.

  const TX_DATE = /^(\d{2}-[A-Za-z]{3}-\d{4})\s*(.*)/;
  // Money amount + balance + Cr./Dr. at end of a line
  const AMOUNTS_RE = /([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(?:Cr\.|Dr\.)\s*$/;

  const TX_SECTION_START = /Your Current Account Transactions/i;

  interface RawBlock {
    date: string;
    lines: string[];
  }

  const rawBlocks: RawBlock[] = [];
  let currentBlock: RawBlock | null = null;
  let inTxSection = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (TX_SECTION_START.test(line)) {
      inTxSection = true;
      continue;
    }
    if (!inTxSection) continue;

    // Skip header/footer lines
    if (!line || /^Date$|^Description$|^Cheque$|^Withdrawal$|^Deposit$|^Balance$|^التاريخ/.test(line)) continue;
    if (/^The National Bank of Ras Al Khaimah|^Page \[/.test(line)) {
      // Page boundary — a new header section follows, which will have TX_SECTION_START again
      inTxSection = false;
      continue;
    }

    const dateM = line.match(TX_DATE);
    if (dateM) {
      const date = parseRAKDate(dateM[1]);
      if (date) {
        if (currentBlock) rawBlocks.push(currentBlock);
        currentBlock = { date, lines: dateM[2] ? [dateM[2]] : [] };
        continue;
      }
    }

    if (currentBlock) {
      currentBlock.lines.push(line);

      // If this line ends with Cr./Dr., the block is complete
      if (AMOUNTS_RE.test(line)) {
        rawBlocks.push(currentBlock);
        currentBlock = null;
      }
    }
  }
  if (currentBlock) rawBlocks.push(currentBlock);

  // RAKBANK lists transactions newest-first; reverse to get chronological order
  rawBlocks.reverse();

  // ── Extract per-block data ─────────────────────────────────────────────────
  const transactions: ParsedTransaction[] = [];
  let prevBalance = openingBalance ?? 0;

  for (const block of rawBlocks) {
    const allText = [block.date, ...block.lines].join(' ');

    // Find the amounts line (has Cr./Dr.)
    const amtsLine = block.lines.find(l => AMOUNTS_RE.test(l));
    if (!amtsLine) continue;

    const amtM = amtsLine.match(AMOUNTS_RE)!;
    const txAmount = parseNum(amtM[1])!;
    const balance = parseNum(amtM[2])!;

    // Debit vs credit from balance delta
    const delta = balance - prevBalance;
    const debit = delta < -0.001 ? parseFloat((-delta).toFixed(2)) : null;
    const credit = delta > 0.001 ? parseFloat(delta.toFixed(2)) : null;

    // Description: all text except the amounts line
    const descLines = block.lines.filter(l => l !== amtsLine);
    const desc = cleanText(
      descLines.join(' ')
        .replace(/([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(?:Cr\.|Dr\.)/, '') // remove stray amounts
        .trim(),
    );

    const cls = classifyRAKBANK(desc, debit, credit);

    transactions.push({
      date: block.date,
      value_date: null,
      narration: desc || 'Transaction',
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

    prevBalance = balance;
  }

  // All other bank parsers store newest-first (matching PDF order).
  // RAKBANK reversed blocks for balance-delta calculation, so flip back.
  const closingBalance = transactions.length ? transactions[transactions.length - 1].running_balance : null;
  transactions.reverse();

  const account: ParsedAccount = {
    iban,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'RAKBANK',
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

interface RAKClassified {
  type: string;
  counterparty: string | null;
  isCharge: boolean;
}

function classifyRAKBANK(desc: string, debit: number | null, credit: number | null): RAKClassified {
  if (/CHARGE COLLECTION|BUSBNK_MAINT_FEE|BUSBNK_LEDGER_FEE|MONTHLY MAINTENANCE/i.test(desc)) {
    return { type: 'MONTHLY_CHARGE', counterparty: null, isCharge: true };
  }
  if (/BUSBNK_CHQ_ISSUE|CHQ ISSUE CHARGE/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/PROFILE CHANGE|EXPIRED TRADE LICENCE|GCHRG\//i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/Charges Receivable Recovery/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/OUTWARD REMITTANCE CHARGE/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/ATM CASH DEPOSIT|CASH DEPOSIT/i.test(desc)) {
    return { type: 'CASH_DEPOSIT', counterparty: null, isCharge: false };
  }
  if (/OUTWARD T\/T/i.test(desc)) {
    const cp = desc.match(/OUTWARD T\/T\s+[\d.]+\s+(.+)/i)?.[1]?.trim() ?? null;
    return { type: 'OUTWARD_TRANSFER', counterparty: cp, isCharge: false };
  }
  if (/INWARD TRANSFER|INWARD T\/T|INWARD REMITTANCE/i.test(desc)) {
    return { type: 'INWARD_TRANSFER', counterparty: null, isCharge: false };
  }

  return {
    type: credit ? 'INWARD_TRANSFER' : 'OUTWARD_TRANSFER',
    counterparty: null,
    isCharge: false,
  };
}
