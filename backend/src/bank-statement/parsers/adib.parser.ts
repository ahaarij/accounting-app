import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText } from './types';

// BIC codes to readable bank names for inward transfer descriptions
const BIC_TO_BANK: Record<string, string> = {
  WIOB: 'Wio Bank',
  DUIB: 'Dubai Islamic Bank',
  MEBL: 'Emirates Islamic Bank',
  EBIL: 'Emirates NBD',
  EBILAEAD: 'Emirates NBD',
  NBSH: 'National Bank of Fujairah',
  NBSHAEAS: 'National Bank of Fujairah',
  ADCB: 'Abu Dhabi Commercial Bank',
  ADCBAEAA: 'Abu Dhabi Commercial Bank',
  BOML: 'Bank of Maharashtra',
  BOMLAEA: 'Bank of Maharashtra',
  FAM: 'Abu Dhabi Islamic Bank (ADIB)',
  ADIB: 'Abu Dhabi Islamic Bank',
  NBAD: 'First Abu Dhabi Bank',
  FABI: 'First Abu Dhabi Bank',
  FABN: 'First Abu Dhabi Bank',
  MASHREQBK: 'Mashreq Bank',
  MASH: 'Mashreq Bank',
  RAKBAEAA: 'RAK Bank',
  RAKB: 'RAK Bank',
};

function lookupBIC(bic: string): string {
  return BIC_TO_BANK[bic.toUpperCase()] ?? bic;
}

export function parseADIB(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  // ── Header extraction ─────────────────────────────────────────────────────
  const get = (pattern: RegExp) => { const m = fullText.match(pattern); return m ? m[1].trim() : null; };

  const accountNumber = get(/Account Number\s+(\S+)/i) ?? get(/Account No\.?\s*[:\-]?\s*(\S+)/i) ?? 'UNKNOWN';
  const currency = get(/\bCurrency\s+([A-Z]{3})\b/i) ?? 'AED';

  // Company name may wrap to a second line: "Account Name BLACK PEPPER GENERAL\nTRADING L L C"
  let holderName = 'UNKNOWN';
  const nameLine = fullText.match(/Account Name\s+(.+)/i);
  if (nameLine) {
    holderName = nameLine[1].trim();
    if (!/(LLC|L\.L\.C\.?|L\s+L\s+C|FZCO|FZE)\s*$/i.test(holderName)) {
      const allLines = fullText.split('\n');
      const idx = allLines.findIndex(l => /Account Name/i.test(l));
      if (idx >= 0 && idx + 1 < allLines.length) {
        const next = allLines[idx + 1].trim();
        if (next && /^[A-Z]/.test(next) && /(LLC|L\.L\.C\.?|L\s+L\s+C|FZCO|FZE)\s*$/i.test(next)) {
          holderName = `${holderName} ${next}`;
        }
      }
    }
    holderName = holderName.replace(/\s+/g, ' ').trim();
  }
  const iban = get(/IBAN\s*[:\-]?\s*(AE\S+)/i);
  const openingBalance = parseNum(get(/Opening Balance\s*[:\-]?\s*([\d,]+\.?\d*)/i));

  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  const periodMatch = fullText.match(/Transaction Date From\s+(\d{2}-\d{2}-\d{4})\s+To\s+(\d{2}-\d{2}-\d{4})/i);
  if (periodMatch) {
    periodFrom = parseDate(periodMatch[1]);
    periodTo = parseDate(periodMatch[2]);
  }

  const account: ParsedAccount = {
    iban: iban ?? '',
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'Abu Dhabi Islamic Bank',
    currency,
    opening_balance: openingBalance,
    closing_balance: null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  // ── Transaction parsing ───────────────────────────────────────────────────
  const DATE_DATE = /^(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})(.*)/;
  const transactions: ParsedTransaction[] = [];

  // Group lines into transaction blocks — each block starts with DD-MM-YYYY DD-MM-YYYY
  const blocks: { txDate: string; valDate: string; content: string[] }[] = [];
  let current: { txDate: string; valDate: string; content: string[] } | null = null;

  for (const line of lines) {
    const m = line.match(DATE_DATE);
    if (m) {
      if (current) blocks.push(current);
      current = { txDate: m[1], valDate: m[2], content: [m[3].trim()] };
    } else if (current) {
      current.content.push(line.trim());
    }
  }
  if (current) blocks.push(current);

  for (const block of blocks) {
    const raw = cleanText(block.content.filter(Boolean).join(' '));
    const date = parseDate(block.txDate);
    const valueDate = parseDate(block.valDate);
    if (!date) continue;

    // Extract trailing 3 numbers: debit credit balance
    const numMatch = raw.match(/([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s*$/);
    if (!numMatch) continue;

    const debit = parseNum(numMatch[1]);
    const credit = parseNum(numMatch[2]);
    const balance = parseNum(numMatch[3]);
    const narrationRaw = raw.slice(0, raw.lastIndexOf(numMatch[0])).trim();

    // Extract 16-digit reference
    const refMatch = narrationRaw.match(/\b(\d{16})\b/);
    const reference = refMatch ? refMatch[1] : null;

    // Clean narration — remove the ref number from display text
    const narration = cleanText(narrationRaw.replace(/\b\d{16}\b/, '').trim());

    const parsed = parseADIBNarration(narration);

    // charge_ref: for charges, use the EPHCOP ref so they group to parent
    const ephcopMatch = narration.match(/EPHCOP[A-Z0-9]+/i);
    const charge_ref = ephcopMatch ? ephcopMatch[0].toUpperCase() : reference;

    transactions.push({
      date,
      value_date: valueDate,
      narration: parsed.description ?? narration,
      counterparty: parsed.counterparty,
      transaction_type: parsed.transaction_type,
      reference,
      charge_ref,
      debit: debit && debit > 0 ? debit : null,
      credit: credit && credit > 0 ? credit : null,
      running_balance: balance,
      is_charge: parsed.is_charge,
      fx_rate: parsed.fx_rate,
      fx_original_amount: parsed.fx_original_amount,
      fx_original_currency: parsed.fx_original_currency,
    });
  }

  // Derive closing balance from last transaction
  const lastBalance = transactions.length ? transactions[transactions.length - 1].running_balance : null;
  account.closing_balance = lastBalance;

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
}

// ── Narration interface ───────────────────────────────────────────────────────

interface ParsedNarration {
  transaction_type: string;
  counterparty: string | null;
  is_charge: boolean;
  description: string | null;
  fx_rate: number | null;
  fx_original_amount: number | null;
  fx_original_currency: string | null;
}

// ── Main narration classifier ─────────────────────────────────────────────────

function parseADIBNarration(narration: string): ParsedNarration {
  const n = narration;

  // ── Charges ──────────────────────────────────────────────────────────────
  if (/VAT ON CHARGES/i.test(n)) {
    return mk('VAT_CHARGE', null, true, 'VAT on bank charges');
  }
  if (/MONTHLY CHARGES|MONTHLY FEE/i.test(n)) {
    return mk('MONTHLY_CHARGE', null, true, 'Monthly bank charges');
  }
  if (/TRADE LICENSE/i.test(n)) {
    return mk('BANK_CHARGE', null, true, 'Trade license charge');
  }
  if (/(?:^|\s)-\s*CHARGES\s*$/i.test(n) || /^CHARGES\s*$/i.test(n)) {
    return mk('BANK_CHARGE', null, true, 'Bank charge');
  }

  // ── Cash deposit ─────────────────────────────────────────────────────────
  if (/CCDM|CDM|CASH DEPOSIT/i.test(n)) {
    return mk('CASH_DEPOSIT', 'CDM', false, 'Cash deposit');
  }

  // ── FX cash rewards ──────────────────────────────────────────────────────
  if (/FX CASH REWARDS/i.test(n)) {
    return mk('SUSPENSE', null, false, 'FX cash rewards');
  }

  // ── Internal transfer (IB-INTT) ──────────────────────────────────────────
  if (/IB-INTT/i.test(n)) {
    const counterparty = extractOutwardCounterparty(n);
    return mk('INTERNAL_TRANSFER', counterparty, false, 'Internal transfer');
  }

  // ── Outward transfer (IB-DFT) ────────────────────────────────────────────
  // Format: IB-DFT-{id} Ref-REF {amount} {COUNTERPARTY} [- Charges]
  if (/IB-DFT/i.test(n)) {
    const counterparty = extractOutwardCounterparty(n);
    const refAmtMatch = n.match(/Ref-REF\s+([\d,]+\.?\d*)/i);
    const refAmt = refAmtMatch ? parseNum(refAmtMatch[1]) : null;
    const desc = refAmt
      ? `Local transfer · AED ${refAmt.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`
      : 'Local transfer';
    return mk('OUTWARD_TRANSFER', counterparty, false, desc);
  }

  // ── Inward: Format A — LN prefix (via ADIB network from local bank) ──────
  // LN28031322904258:-WIOB GDI ALAKIS SOLAR ENERGY SYSTEMS COMPO REFSolar404C...
  const lnMatch = n.match(/^LN[\w]+:-([A-Z]{4})\s+([A-Z]{2,4})\s+(.+?)\s+REF/i);
  if (lnMatch) {
    const bank = lookupBIC(lnMatch[1]);
    const purpose = lnMatch[2].toUpperCase();
    const counterparty = cleanText(lnMatch[3]);
    return mk('INWARD_TRANSFER', counterparty, false, `Inward · ${bank} · ${purpose}`);
  }

  // ── Inward: Format B — MBA prefix (via SWIFT) ────────────────────────────
  // MBA0004346045250:-DUIB PIN 1IBTASAM MALIK2PO BOX 432 REF...
  const mbaMatch = n.match(/^MBA[\w]+:-([A-Z]{4})\s+([A-Z]{2,4})\s+1(.+?)2/i);
  if (mbaMatch) {
    const bank = lookupBIC(mbaMatch[1]);
    const purpose = mbaMatch[2].toUpperCase();
    const counterparty = cleanText(mbaMatch[3]);
    return mk('INWARD_TRANSFER', counterparty, false, `Inward · ${bank} · ${purpose}`);
  }

  // ── Inward: Format B2 — MBA prefix, short/any BIC, no 1…2 markers ────────
  // MBA0004222852722:-COM IBTASAM SHAHZAD MALIK 554A250506052441
  const mba2Match = n.match(/^MBA[\w]+:-([A-Z]{3,4})\s+(.+)/i);
  if (mba2Match) {
    const bank = lookupBIC(mba2Match[1]);
    const body = mba2Match[2].replace(/\s+[A-Z0-9]{6,}\s*$/i, '').trim();
    const counterparty = cleanText(body);
    return mk('INWARD_TRANSFER', counterparty, false, `Inward · ${bank}`);
  }

  // ── Inward: Format D — EPHCOR prefix (from EIB) ──────────────────────────
  // EPHCOR02205K8IP4:-MEBL PIN IBTASAM MALIK REF404G2501228E4DA8:2
  const ephcorMatch = n.match(/^EPHCOR\S+:-([A-Z]{4})\s+([A-Z]{2,4})\s+(.+?)\s+REF/i);
  if (ephcorMatch) {
    const bank = lookupBIC(ephcorMatch[1]);
    const purpose = ephcorMatch[2].toUpperCase();
    const counterparty = cleanText(ephcorMatch[3]);
    return mk('INWARD_TRANSFER', counterparty, false, `Inward · ${bank} · ${purpose}`);
  }

  // ── Inward: Format C — plain ref prefix (from FAM/other) ─────────────────
  // 479000217:-FAM HAMIDA SOUMATI 554A250505913021
  const plainRefMatch = n.match(/^\d+:-([A-Z]{3,4})\s+(.+?)\s+\d{3,}[A-Z]/i);
  if (plainRefMatch) {
    const bank = lookupBIC(plainRefMatch[1]);
    const counterparty = cleanText(plainRefMatch[2]);
    return mk('INWARD_TRANSFER', counterparty, false, `Inward · ${bank}`);
  }

  // ── Generic inward fallback ───────────────────────────────────────────────
  if (/INWARD|IPP|REMIT/i.test(n)) {
    return mk('INWARD_TRANSFER', null, false, 'Inward transfer');
  }

  return mk('SUSPENSE', null, false, null);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mk(
  transaction_type: string,
  counterparty: string | null,
  is_charge: boolean,
  description: string | null,
): ParsedNarration {
  return { transaction_type, counterparty, is_charge, description, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
}

function extractOutwardCounterparty(narration: string): string | null {
  // IB-DFT-{id} Ref-REF {amount} {COUNTERPARTY} [- Charges]
  const m = narration.match(/Ref-REF\s+[\d,]+\.?\d*\s+(.+?)(?:\s+-\s+Charges)?\s*$/i);
  if (!m) return null;
  // Strip trailing 13-16 digit account numbers appended by ADIB (e.g. "COMPANY LLC 5451706252207644")
  return cleanText(m[1].replace(/\s+\d{13,16}\s*$/, ''));
}
