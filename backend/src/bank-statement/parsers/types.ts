export interface ParsedAccount {
  iban: string;
  account_number: string;
  holder_name: string;
  bank_name: string;
  currency: string;
  opening_balance: number | null;
  closing_balance: number | null;
  period_from: string | null; // YYYY-MM-DD
  period_to: string | null;
}

export interface ParsedTransaction {
  date: string;          // YYYY-MM-DD
  value_date: string | null;
  narration: string;
  counterparty: string | null;
  transaction_type: string;
  reference: string | null;
  charge_ref: string | null; // shared ref used to group charge rows to parent
  debit: number | null;
  credit: number | null;
  running_balance: number | null;
  is_charge: boolean;
  fx_rate: number | null;
  fx_original_amount: number | null;
  fx_original_currency: string | null;
}

export interface ParsedStatement {
  accounts: ParsedAccount[];
  transactions: Map<string, ParsedTransaction[]>; // keyed by account_number
}

// ── shared date / number helpers ──────────────────────────────────────────────

const MONTH_MAP: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

export function parseDate(raw: string): string | null {
  if (!raw) return null;
  raw = raw.trim();

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  let m = raw.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;

  // DD-Mon-YYYY (e.g. 01-Jan-2026 — used by ADCB and RAKBANK)
  m = raw.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }

  // DD Mon YYYY  e.g. "01 Jan 2026" or "25 May 2026"
  m = raw.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (m) {
    const mo = MONTH_MAP[m[2].toLowerCase()];
    if (mo) return `${m[3]}-${mo}-${m[1].padStart(2,'0')}`;
  }

  // YYYY-MM-DD
  m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return raw;

  return null;
}

export function parseNum(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const n = parseFloat(raw.replace(/,/g, ''));
  return isNaN(n) ? null : n;
}

export function cleanText(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

// Ensure transactions are stored newest-first (newest = lowest DB id).
// The service queries ORDER BY date DESC, id DESC — for chronological display
// within a day, the oldest transaction must have the highest id.
// Detects PDF order by comparing first vs last date; reverses if oldest-first.
export function ensureNewestFirst(transactions: ParsedTransaction[]): void {
  if (transactions.length < 2) return;
  const firstDate = transactions[0].date;
  const lastDate = transactions[transactions.length - 1].date;
  if (firstDate && lastDate && firstDate < lastDate) {
    transactions.reverse();
  }
}
