import { ParsedStatement, ParsedAccount, ParsedTransaction, parseNum, cleanText } from './types';

const MONTH_MAP: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseMSQDate(raw: string): string | null {
  // DD/MM/YYYY
  let m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  // DD Mon YYYY (e.g. "31 Jan 2026")
  m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }
  return null;
}

export function parseMashreq(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  return parseMashreqCROSSFIT(fullText);
}

// ── CROSSFIT / simple Mashreq format ─────────────────────────────────────────

function parseMashreqCROSSFIT(fullText: string): ParsedStatement {
  const lines = fullText.split('\n');

  // Header — values extracted from labelled fields
  const accountNumber = fullText.match(/^(\d{12})\s*$/m)?.[1] ?? 'UNKNOWN';
  const holderName = fullText.match(/([A-Z][A-Z ]+(?:LLC|FZE|LTD|CO|WLL|TRADING))\b/)?.[1]?.trim() ?? 'UNKNOWN';
  const currency = fullText.match(/Account Currency\s+\S+\s+(AED|USD|EUR)/i)?.[1]
    ?? fullText.match(/^(AED|USD|EUR)\s*$/m)?.[1] ?? 'AED';
  const periodMatch = fullText.match(/Statement for period (\d{2} [A-Za-z]{3} \d{4}) to (\d{2} [A-Za-z]{3} \d{4})/i);
  const periodFrom = periodMatch ? parseMSQDate(periodMatch[1]) : null;
  const periodTo = periodMatch ? parseMSQDate(periodMatch[2]) : null;
  const openingMatch = fullText.match(/Opening Balance\s+([\d,]+\.\d{2})/i);
  const closingMatch = fullText.match(/Closing Balance\s+([\d,]+\.\d{2})/i);

  // Transactions: two-line format
  // Line 1: DD Mon YYYY  DD Mon YYYY  ref1 ref2  Description text
  // Line 2: account_num  -amount  balance
  const DATE2_RE = /^(\d{2} [A-Za-z]{3} \d{4})\s+(\d{2} [A-Za-z]{3} \d{4})\s+(.+)$/;
  const AMOUNTS_RE = /(-?[\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;

  const transactions: ParsedTransaction[] = [];
  let pendingDate: string | null = null;
  let pendingValueDate: string | null = null;
  let pendingDesc: string | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const dateMatch = line.match(DATE2_RE);
    if (dateMatch) {
      pendingDate = parseMSQDate(dateMatch[1]);
      pendingValueDate = parseMSQDate(dateMatch[2]);
      const rest = dateMatch[3];
      // Strip leading 1–2 reference tokens; description is the human-readable remainder
      const descMatch = rest.match(/^\S+\s+\S+\s+(.+)$/) ?? rest.match(/^\S+\s+(.+)$/);
      pendingDesc = descMatch ? descMatch[1].trim() : rest.trim();
      continue;
    }

    if (pendingDate && pendingDesc) {
      const amtMatch = line.match(AMOUNTS_RE);
      if (amtMatch) {
        const amount = parseNum(amtMatch[1])!;
        const balance = parseNum(amtMatch[2])!;
        const cls = classifyMashreq(pendingDesc, amount);

        transactions.push({
          date: pendingDate,
          value_date: pendingValueDate,
          narration: pendingDesc,
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

        pendingDate = null;
        pendingValueDate = null;
        pendingDesc = null;
      }
    }
  }

  const account: ParsedAccount = {
    iban: null,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'Mashreq Bank',
    currency,
    opening_balance: openingMatch ? parseNum(openingMatch[1]) : null,
    closing_balance: closingMatch ? parseNum(closingMatch[1]) : null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
}

// ── Shared classifier ─────────────────────────────────────────────────────────

interface MashreqClassified {
  type: string;
  counterparty: string | null;
  isCharge: boolean;
}

function classifyMashreq(desc: string, amount: number): MashreqClassified {
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
  if (/SWIFT CHARGE|TELEX CHARGE|BANK CHARGE/i.test(desc)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true };
  }
  if (/CASH DEPOSIT|CDM DEPOSIT/i.test(desc)) {
    return { type: 'CASH_DEPOSIT', counterparty: null, isCharge: false };
  }

  // Inward SWIFT (GDI- = Global Direct Inward)
  if (/^GDI-|^GDS-/i.test(desc)) {
    const cp = desc.match(/^GD[IS]-(.+?)(?:\s+-\s*.+)?$/i)?.[1]?.trim() ?? null;
    return { type: 'INWARD_TRANSFER', counterparty: cp, isCharge: false };
  }

  // Outward transfer (OAT- = Outward Account Transfer)
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
