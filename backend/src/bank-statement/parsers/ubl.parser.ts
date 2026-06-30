import { ParsedStatement, ParsedAccount, ParsedTransaction, parseNum, cleanText, ensureNewestFirst } from './types';

const MONTH_MAP: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseUBLDate(raw: string): string | null {
  let m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

// UBL (United Bank Limited) statement format.
// Header: labels (BRANCH: / ACCOUNT NO: / ...) appear first, values follow.
// Transactions end with:  signed_amount  running_balance\tDD/MM/YYYY
export function parseUBL(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  // ── Header ────────────────────────────────────────────────────────────────
  const iban = fullText.match(/\b(AE\d{2}[0-9]{20})\b/)?.[1] ?? null;
  // Account number is the first standalone 9-15 digit line after STATEMENT PERIOD
  const stmtPeriodIdx = lines.findIndex(l => /^STATEMENT PERIOD:/i.test(l.trim()));
  let accountNumber = 'UNKNOWN';
  for (let i = stmtPeriodIdx + 1; i < lines.length; i++) {
    if (/^\d{9,15}$/.test(lines[i].trim())) { accountNumber = lines[i].trim(); break; }
  }
  const holderName = fullText.match(/([A-Z][A-Z ]+(?:LLC|FZE|LTD|CO|WLL|TRADING))\b/)?.[1]?.trim() ?? 'UNKNOWN';
  const currency = fullText.match(/^(AED|USD|EUR)\s*$/m)?.[1] ?? 'AED';

  const periodMatch = fullText.match(/STATEMENT PERIOD:\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*(\d{2}\/\d{2}\/\d{4})/);
  const periodFrom = periodMatch ? parseUBLDate(periodMatch[1]) : null;
  const periodTo = periodMatch ? parseUBLDate(periodMatch[2]) : null;

  const openingBalMatch = fullText.match(/\*\*OPENING BALANCE\*\*\s*([\d,]+\.\d{2})/);
  const openingBalance = openingBalMatch ? parseNum(openingBalMatch[1]) : null;

  // ── Transactions ──────────────────────────────────────────────────────────
  // Each transaction line (possibly multi-line) ends with:
  //   signed_amount  running_balance\tDD/MM/YYYY
  // "BRANCH:" at start of a line = page-2 header boundary → flush description buffer.
  // "Particulars Inst No. Debit Credit Balance" = column header → enable accumulation.
  const TX_END = /(-?[\d,]+\.\d{2})\s+([\d,]+\.\d{2})\t(\d{2}\/\d{2}\/\d{4})\s*$/;

  const transactions: ParsedTransaction[] = [];
  let descBuffer: string[] = [];
  let seenColumnHeader = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (/^BRANCH:\s*$/.test(line)) { descBuffer = []; continue; }

    if (/^Particulars\s+Inst/.test(line)) {
      seenColumnHeader = true;
      descBuffer = [];
      continue;
    }

    if (!seenColumnHeader) continue;

    if (!line || line.startsWith('**') || line === 'Date'
        || /^Note:|^This is/.test(line)
        || /^[A-Z ]+:\s*$/.test(line)
        || /^\d{1,2} of \d+$/.test(line)
        || /^\d{9,15}$/.test(line)
        || /^\d{2}\/\d{2}\/\d{4}$/.test(line)
        || /^[\d,]+\.\d{2}$/.test(line)) {
      continue;
    }

    const m = line.match(TX_END);
    if (m) {
      const prefix = line.slice(0, m.index!).trim();
      if (prefix) descBuffer.push(prefix);

      const amount = parseNum(m[1])!;
      const balance = parseNum(m[2])!;
      const date = parseUBLDate(m[3])!;
      const description = cleanText(descBuffer.join(' '));
      const cls = classifyUBL(description, amount);

      transactions.push({
        date,
        value_date: null,
        narration: description,
        counterparty: cls.counterparty,
        transaction_type: cls.type,
        reference: null,
        charge_ref: null,
        debit: amount < 0 ? Math.abs(amount) : null,
        credit: amount > 0 ? amount : null,
        running_balance: balance,
        is_charge: cls.isCharge,
        fx_rate: null,
        fx_original_amount: null,
        fx_original_currency: null,
      });

      descBuffer = [];
    } else {
      descBuffer.push(line);
    }
  }

  const account: ParsedAccount = {
    iban,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'United Bank Limited',
    currency,
    opening_balance: openingBalance,
    closing_balance: transactions.length ? transactions[transactions.length - 1].running_balance : null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  ensureNewestFirst(transactions);

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
}

// ── Classifier ────────────────────────────────────────────────────────────────

interface UBLClassified {
  type: string;
  counterparty: string | null;
  isCharge: boolean;
}

function classifyUBL(desc: string, amount: number): UBLClassified {
  const isDebit = amount < 0;

  if (/TELEX RECOVERIES|TELEX CHARGE/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/VALUE ADDED TAX|^VAT\b/i.test(desc) && !/TRADING|GENERAL/i.test(desc)) {
    return { type: 'VAT_CHARGE', counterparty: null, isCharge: true };
  }
  if (/MONTHLY MIN BAL CHARGES|MINIMUM BALANCE/i.test(desc)) {
    return { type: 'MONTHLY_CHARGE', counterparty: null, isCharge: true };
  }
  if (/MONTHLY MAINTENANCE|MAINTENANCE FEE/i.test(desc)) {
    return { type: 'MONTHLY_CHARGE', counterparty: null, isCharge: true };
  }
  if (/SWIFT CHARGE|BANK CHARGE/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/TLN EXPIRY|LICENCE EXPIRY|LICENSE EXPIRY/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/CASH DEPOSIT|CDM DEPOSIT/i.test(desc)) {
    return { type: 'CASH_DEPOSIT', counterparty: null, isCharge: false };
  }
  // GDI- = Global Direct Inward (SWIFT credit)
  if (/^GDI-|^GDS-/i.test(desc)) {
    const cp = desc.match(/^GD[IS]-(.+?)(?:\s+-\s*.+)?$/i)?.[1]?.trim() ?? null;
    return { type: 'INWARD_TRANSFER', counterparty: cp, isCharge: false };
  }
  // OAT- = Outward Account Transfer
  if (/^OAT-/i.test(desc)) {
    const cp = desc.match(/^OAT-(.+?)(?:\s+-\s*.+)?$/i)?.[1]?.trim() ?? null;
    return { type: 'OUTWARD_TRANSFER', counterparty: cp, isCharge: false };
  }

  return {
    type: isDebit ? 'OUTWARD_TRANSFER' : 'INWARD_TRANSFER',
    counterparty: null,
    isCharge: false,
  };
}
