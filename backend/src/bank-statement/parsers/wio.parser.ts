import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText, ensureNewestFirst } from './types';

export function parseWio(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');

  // ── Extract shared info from the summary page ─────────────────────────────
  // Company name appears before the first "ACCOUNT STATEMENT" block.
  // pdf-parse column ordering may place the address block after the section header,
  // so fall back to searching the full text if the summary scan fails.
  const firstSectionIdx = fullText.search(/ACCOUNT STATEMENT/i);
  const summaryText = firstSectionIdx > 0 ? fullText.slice(0, firstSectionIdx) : fullText;
  let holderName = extractCompanyName(summaryText);
  if (holderName === 'UNKNOWN') holderName = extractCompanyName(fullText);

  // Parse IBAN → currency map from the summary table:
  // "AE870860000009308890915 0% 21/01/2026 951.29 AED"
  const ibanByCurrency = new Map<string, string>();
  const summaryRe = /\b(AE\d{21})\b[^\n]*(AED|USD|EUR)/g;
  let sm: RegExpExecArray | null;
  while ((sm = summaryRe.exec(summaryText)) !== null) {
    ibanByCurrency.set(sm[2], sm[1]);
  }

  // Period from summary
  const periodMatch = fullText.match(/FROM\s+(\d{2}\/\d{2}\/\d{4})\s+TO\s+(\d{2}\/\d{2}\/\d{4})/i);
  const periodFrom = periodMatch ? parseDate(periodMatch[1]) : null;
  const periodTo   = periodMatch ? parseDate(periodMatch[2]) : null;

  // ── Split into per-account sections ──────────────────────────────────────
  const sectionSplitter = /ACCOUNT STATEMENT\s*\n/gi;
  const sectionStarts: number[] = [];
  let sm2: RegExpExecArray | null;
  while ((sm2 = sectionSplitter.exec(fullText)) !== null) {
    sectionStarts.push(sm2.index);
  }

  const sections: string[] = sectionStarts.length > 0
    ? sectionStarts.map((start, i) => fullText.slice(start, sectionStarts[i + 1] ?? fullText.length))
    : [fullText];

  const accounts: ParsedAccount[] = [];
  const txMap = new Map<string, ParsedTransaction[]>();

  for (const section of sections) {
    const parsed = parseWioSection(section, holderName, ibanByCurrency, periodFrom, periodTo);
    if (parsed) {
      const num = parsed.account.account_number;
      const ccy = parsed.account.currency;
      const existingTxs = txMap.get(num);
      if (existingTxs !== undefined) {
        // Same account_number already in map — check currency
        const existingAcc = accounts.find(a => a.account_number === num);
        if (existingAcc?.currency === ccy) {
          // Same account spanning multiple pages — accumulate
          existingTxs.push(...parsed.transactions);
        } else {
          // Different currency sharing same account_number — disambiguate
          const altNum = `${ccy}_${num}`;
          parsed.account.account_number = altNum;
          accounts.push(parsed.account);
          txMap.set(altNum, parsed.transactions);
        }
      } else {
        accounts.push(parsed.account);
        txMap.set(num, parsed.transactions);
      }
    }
  }

  return { accounts, transactions: txMap };
}

function extractCompanyName(text: string): string {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const LLC_RE = /\b(?:LLC|L\.L\.C\.?|L\s+L\s+C|FZCO|FZE|WHOLESALERS)\s*\.?\s*$/;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!LLC_RE.test(line)) continue;
    if (/:/.test(line)) continue;
    const prev = i > 0 ? lines[i - 1] : '';
    if (prev && /^[A-Z][A-Z0-9\s]*$/.test(prev) && !/:/.test(prev) && prev.length > 3) {
      return `${prev} ${line}`.replace(/\s+/g, ' ').trim();
    }
    return line.replace(/\s+/g, ' ').trim();
  }
  return 'UNKNOWN';
}

function parseWioSection(
  text: string,
  holderName: string,
  ibanByCurrency: Map<string, string>,
  periodFrom: string | null,
  periodTo: string | null,
): { account: ParsedAccount; transactions: ParsedTransaction[] } | null {
  const lines = text.split('\n');

  // Determine this section's currency from the balance header line: "( )  AED" or "( )	USD"
  const currencyMatch = text.match(/\(\s*\)\s*[\t ]+(AED|USD|EUR)/);
  const currency = currencyMatch ? currencyMatch[1] : 'AED';

  // Look up IBAN for this currency from the summary map
  // Prefer IBAN found within this section; fall back to the summary currency map
  const ibanInSection = text.match(/\b(AE\d{21})\b/)?.[1] ?? null;
  const iban = ibanInSection ?? ibanByCurrency.get(currency) ?? null;
  const accountNumber = iban
    ? (iban.slice(7).replace(/^0+/, '') || iban.slice(7))
    : `WIO_${currency}_${Date.now()}`;

  // Closing balance: last transaction's running_balance (set after parsing)
  const account: ParsedAccount = {
    iban,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'Wio Bank',
    currency,
    opening_balance: null,
    closing_balance: null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  // ── Transaction parsing ───────────────────────────────────────────────────
  // Format: DD/MM/YYYY P{9digits} {Description} {SignedAmount} {Balance}
  const TX_LINE = /^(\d{2}\/\d{2}\/\d{4})\s+(P\d{9})\s+(.+?)\s+(-?[\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/;
  const transactions: ParsedTransaction[] = [];

  let prevRef: string | null = null;

  for (const line of lines) {
    const m = line.trim().match(TX_LINE);
    if (!m) continue;

    const date = parseDate(m[1]);
    if (!date) continue;

    const ref = m[2];
    const description = cleanText(m[3]);
    const amount = parseNum(m[4].replace(/,/g, ''));
    const balance = parseNum(m[5].replace(/,/g, ''));

    const debit = amount !== null && amount < 0 ? Math.abs(amount) : null;
    const credit = amount !== null && amount > 0 ? amount : null;

    const { transaction_type, counterparty, is_charge, charge_ref, fx_rate, fx_original_amount, fx_original_currency } =
      classifyWio(description, amount ?? 0, ref, prevRef);

    transactions.push({
      date,
      value_date: date,
      narration: description,
      counterparty,
      transaction_type,
      reference: ref,
      charge_ref,
      debit,
      credit,
      running_balance: balance,
      is_charge,
      fx_rate,
      fx_original_amount,
      fx_original_currency,
    });

    if (!is_charge) prevRef = ref;
  }

  if (transactions.length === 0) return null;

  account.closing_balance = transactions[transactions.length - 1].running_balance;
  ensureNewestFirst(transactions);
  return { account, transactions };
}

function classifyWio(description: string, amount: number, ref: string, prevRef: string | null): {
  transaction_type: string;
  counterparty: string | null;
  is_charge: boolean;
  charge_ref: string | null;
  fx_rate: number | null;
  fx_original_amount: number | null;
  fx_original_currency: string | null;
} {
  // Charge rows
  if (/Swift International Transaction Fee|Local Transfer Fee/i.test(description)) {
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, charge_ref: prevRef, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // FX conversion: "USD to AED (rate: 0.2725)" or "AED to USD"
  const fxMatch = description.match(/(\w+)\s+to\s+(\w+)\s+\(rate:\s*([\d.]+)\)/i);
  if (fxMatch) {
    const fromCcy = fxMatch[1].toUpperCase();
    const rate = parseNum(fxMatch[3]);
    return {
      transaction_type: 'FX_CONVERSION',
      counterparty: null,
      is_charge: false,
      charge_ref: ref,
      fx_rate: rate,
      fx_original_amount: amount < 0 ? Math.abs(amount) : amount,
      fx_original_currency: fromCcy,
    };
  }

  // Outward with rate (international)
  const outRateMatch = description.match(/^To\s+(.+?)\s+\(rate:\s*([\d.]+)\)/i);
  if (outRateMatch) {
    const counterparty = cleanText(outRateMatch[1]);
    const rate = parseNum(outRateMatch[2]);
    return { transaction_type: 'OUTWARD_INTERNATIONAL', counterparty, is_charge: false, charge_ref: ref, fx_rate: rate, fx_original_amount: null, fx_original_currency: null };
  }

  // Outward local
  const outMatch = description.match(/^To\s+(.+)/i);
  if (outMatch) {
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty: cleanText(outMatch[1]), is_charge: false, charge_ref: ref, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // Inward
  const inMatch = description.match(/^From\s+(.+?)(?:\s+PORT\s+S.*)?$/i);
  if (inMatch) {
    return { transaction_type: 'INWARD_TRANSFER', counterparty: cleanText(inMatch[1]), is_charge: false, charge_ref: ref, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  return { transaction_type: 'OTHER', counterparty: null, is_charge: false, charge_ref: ref, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
}
