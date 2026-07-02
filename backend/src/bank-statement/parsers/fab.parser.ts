import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText, ensureNewestFirst } from './types';

const MONTH_ABBR: Record<string, string> = {
  jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
  jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12',
};

function parseFABDate(raw: string): string | null {
  const m = raw.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!m) return null;
  const mo = MONTH_ABBR[m[2].toLowerCase()];
  if (!mo) return null;
  return `${m[3]}-${mo}-${m[1].padStart(2, '0')}`;
}

export function parseFAB(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  // ── Header ────────────────────────────────────────────────────────────────
  const get = (re: RegExp) => { const m = fullText.match(re); return m ? m[1].trim() : null; };
  const holderName = get(/Company Name:\s*(.+)/i) ?? get(/Customer Name:\s*(.+)/i) ?? 'UNKNOWN';
  const accountNumber = get(/Account Number:\s*(\S+)/i) ?? 'UNKNOWN';
  const currency = get(/\b(AED|USD|EUR)\b/) ?? 'AED';

  const account: ParsedAccount = {
    iban: null,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'First Abu Dhabi Bank',
    currency,
    opening_balance: null,
    closing_balance: null,
    period_from: null,
    period_to: null,
  };

  // ── Transactions ──────────────────────────────────────────────────────────
  // Columns (PDF extraction collapses spacing):
  // {DD Mon YYYY}{DD Mon YYYY}{signed_amount} {tx_type} {narrative} {balance}{purpose}{cust_ref} {bank_ref} {channel_ref}
  const TX_LINE = /^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})\s*(.*)/;
  const transactions: ParsedTransaction[] = [];

  for (const line of lines) {
    const m = line.match(TX_LINE);
    if (!m) continue;

    const date = parseFABDate(m[1]);
    const valueDate = parseFABDate(m[2]);
    if (!date) continue;

    const rest = m[3].trim();
    if (!rest) continue;

    // Signed amount is the first token
    const amtMatch = rest.match(/^(-?[\d,]+\.?\d*)/);
    if (!amtMatch) continue;
    const amount = parseFloat(amtMatch[1].replace(/,/g, ''));
    if (isNaN(amount)) continue;

    const debit = amount < 0 ? Math.abs(amount) : null;
    const credit = amount > 0 ? amount : null;

    const afterAmt = rest.slice(amtMatch[0].length).trim();

    // Balance: first decimal number in afterAmt — supports negative (overdraft)
    const balMatch = afterAmt.match(/(-?[\d,]+\.\d{2})/);
    const balance = balMatch ? parseNum(balMatch[1]) : null;

    // Description: tx_type + narrative code, between amount and balance
    const descPart = balMatch
      ? afterAmt.slice(0, afterAmt.indexOf(balMatch[0]))
          .replace(/^[\s\-–]+/, '')
          .replace(/[\s\-–]+$/, '')
          .trim()
      : afterAmt;
    const rawNarrative = cleanText(descPart);

    // Text after balance contains: {purpose}{cust_ref} {bank_ref} {channel_ref}
    const afterBal = balMatch
      ? afterAmt.slice(afterAmt.indexOf(balMatch[0]) + balMatch[0].length).trim()
      : '';

    // Purpose of Payment: text before the first FT/GFT/CHG/TT bank ref, cust_ref stripped
    const purpose = extractFABPurpose(afterBal);

    // Bank ref: no word boundary — cust_ref and bank_ref are sometimes concatenated (e.g. AGFT...)
    const bankRefMatch = afterBal.match(/((?:FT|GFT|CHG|TT)[A-Z0-9]{5,})/i);
    const reference = bankRefMatch ? bankRefMatch[1].toUpperCase() : null;

    const parsed = classifyFAB(rawNarrative, amount, purpose);

    // Build final narration from description + purpose
    let narration = parsed.description ?? rawNarrative;
    if (purpose && parsed.description && !parsed.description.includes(purpose)) {
      narration = `${parsed.description} · ${purpose}`;
    }

    transactions.push({
      date,
      value_date: valueDate,
      narration: cleanText(narration),
      counterparty: parsed.counterparty,
      transaction_type: parsed.transaction_type,
      reference,
      charge_ref: reference,
      debit,
      credit,
      running_balance: balance,
      is_charge: parsed.is_charge,
      fx_rate: null,
      fx_original_amount: null,
      fx_original_currency: null,
    });
  }

  // Derive period from first/last dates
  if (transactions.length) {
    account.period_from = transactions[0].date;
    account.period_to = transactions[transactions.length - 1].date;
    account.closing_balance = transactions[transactions.length - 1].running_balance;
    ensureNewestFirst(transactions);
  }

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
}

// ── Narration interface ───────────────────────────────────────────────────────

interface FABParsed {
  transaction_type: string;
  counterparty: string | null;
  is_charge: boolean;
  description: string | null;
}

// ── Classifier ────────────────────────────────────────────────────────────────

function classifyFAB(narrative: string, amount: number, purpose: string | null): FABParsed {
  const n = narrative;

  // ── Charges ──────────────────────────────────────────────────────────────
  if (/VAT CHARGES?/i.test(n)) {
    return { transaction_type: 'VAT_CHARGE', counterparty: null, is_charge: true, description: 'VAT on bank charges' };
  }
  if (/VAT PROP VAL FEE/i.test(n)) {
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: 'Valuation fee + VAT' };
  }
  if (/ACCOUNT MAINTENANCE FEE/i.test(n)) {
    return { transaction_type: 'MONTHLY_CHARGE', counterparty: null, is_charge: true, description: 'Account maintenance fee' };
  }
  if (/MINIMUM BALANCE/i.test(n)) {
    return { transaction_type: 'MONTHLY_CHARGE', counterparty: null, is_charge: true, description: 'Minimum balance charge' };
  }
  if (/OUTWARD TELEX CHARGES?|TELEX CHARGES?/i.test(n)) {
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: 'Outward telex charges' };
  }
  if (/DEBIT INTEREST/i.test(n)) {
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: 'Debit interest' };
  }

  // ── Cash deposit ─────────────────────────────────────────────────────────
  if (/ATM CASH DEPOSIT|SDM CASH|CASH DEPOSIT/i.test(n)) {
    return { transaction_type: 'CASH_DEPOSIT', counterparty: 'CDM', is_charge: false, description: 'Cash deposit' };
  }

  // ── Account Transfer — identify source bank from narrative code ──────────
  if (/ACCOUNT TRANSFER/i.test(n)) {
    const code = n.replace(/ACCOUNT TRANSFER\s*/i, '').trim();

    if (/^EPHCOP/i.test(code)) {
      const desc = purpose
        ? `Inward · Emirates Islamic Bank · ${purpose}`
        : 'Inward · Emirates Islamic Bank';
      return { transaction_type: 'INWARD_TRANSFER', counterparty: 'Emirates Islamic Bank', is_charge: false, description: desc };
    }
    if (/^LN\d/i.test(code)) {
      const desc = purpose
        ? `Inward · Abu Dhabi Islamic Bank · ${purpose}`
        : 'Inward · Abu Dhabi Islamic Bank';
      return { transaction_type: 'INWARD_TRANSFER', counterparty: 'Abu Dhabi Islamic Bank', is_charge: false, description: desc };
    }
    if (/^IBFT/i.test(code)) {
      return { transaction_type: 'INTERNAL_TRANSFER', counterparty: null, is_charge: false, description: 'FAB internal transfer' };
    }

    // Generic account transfer — direction by sign
    if (amount > 0) {
      const desc = purpose ? `Inward transfer · ${purpose}` : 'Inward transfer';
      return { transaction_type: 'INWARD_TRANSFER', counterparty: null, is_charge: false, description: desc };
    }
    const desc = purpose ? `Account transfer · ${purpose}` : 'Account transfer';
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty: null, is_charge: false, description: desc };
  }

  // ── Domestic Transfer ────────────────────────────────────────────────────
  if (/DOMESTIC TRANSFER/i.test(n)) {
    const desc = purpose ? `Local transfer · ${purpose}` : 'Local transfer';
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty: null, is_charge: false, description: desc };
  }

  // ── Within Bank Transfer ─────────────────────────────────────────────────
  if (/WITHIN BANK TRANSFER/i.test(n)) {
    const desc = purpose ? `Within bank · ${purpose}` : 'Within bank transfer';
    return {
      transaction_type: amount < 0 ? 'OUTWARD_TRANSFER' : 'INWARD_TRANSFER',
      counterparty: null,
      is_charge: false,
      description: desc,
    };
  }

  // ── Cheques ──────────────────────────────────────────────────────────────
  if (/CHEQUE PAID/i.test(n)) {
    return { transaction_type: 'CHEQUE_PAID', counterparty: null, is_charge: false, description: 'Cheque paid' };
  }
  if (/RETURNED CHEQUE/i.test(n)) {
    return { transaction_type: 'RETURNED_CHEQUE', counterparty: null, is_charge: false, description: 'Returned cheque' };
  }

  // ── Outward: standard UAE transfer ──────────────────────────────────────
  if (/OUTWARD TRANSFER INSIDE UAE|OUTWARD TRANSFER/i.test(n)) {
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty: null, is_charge: false, description: 'Local transfer' };
  }

  // ── /REF/ continuation lines (remittance information parsed as phantom tx) ─
  if (/^\/REF\//i.test(n)) {
    const purpose = cleanText(n.replace(/^\/REF\//, ''));
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty: null, is_charge: false, description: purpose || 'Local transfer' };
  }

  // ── Inward: Remitter Info pattern (IPI, IPP, LN-ref inward) ─────────────
  // "Remitter Info: COMPANY NAME, Sender: BIC" or "Remitter Info: NAME - FZCO - First Sender:"
  const remitterMatch = n.match(/Remitter Info:\s*(.+?)(?:\s+-\s+First\s|\s*,\s*(?:Sender|Value\s*Date)|$)/i);
  if (remitterMatch) {
    const cp = cleanText(remitterMatch[1]);
    return { transaction_type: 'INWARD_TRANSFER', counterparty: cp || null, is_charge: false, description: 'Inward transfer' };
  }

  // Default — use purpose as description if available
  return {
    transaction_type: amount < 0 ? 'OUTWARD_TRANSFER' : 'INWARD_TRANSFER',
    counterparty: null,
    is_charge: false,
    description: purpose ?? null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Extract Purpose of Payment from the text after the balance.
// afterBal format: {purpose}{cust_ref} {bank_ref} {channel_ref}
// Purpose and cust_ref are directly concatenated in PDF extraction.
function extractFABPurpose(afterBal: string): string | null {
  if (!afterBal) return null;

  // "--" prefix means no purpose
  if (/^--\s/.test(afterBal) || afterBal.trim() === '--') return null;

  // Find first bank/channel ref code to locate end of purpose+cust_ref block
  const bankRefMatch = afterBal.match(/\b(?:FT|GFT|CHG|TT)[A-Z0-9]{5,}/i);
  const beforeRef = bankRefMatch
    ? afterBal.slice(0, afterBal.indexOf(bankRefMatch[0])).trim()
    : afterBal;

  if (!beforeRef || /^--$/.test(beforeRef.trim())) return null;

  // Strip trailing cust_ref patterns that get concatenated with purpose
  // e.g. "Goods bought (Imports in CIF value)IB-UAE Transfer" → strip "IB-UAE Transfer"
  const cleaned = beforeRef
    .replace(/\s*IB-[\w\s]+$/i, '')       // IB-UAE Transfer, IB-Within FAB
    .replace(/\s*GCN-[\w\s]+$/i, '')       // GCN-LOCAL FT
    .replace(/\s*TL\s+[\w\s]+$/i, '')      // TL Exp Charge
    .replace(/\s*REF\s+[\w]+\s*$/i, '')    // REF PAYMENT A
    .replace(/\s*SDM\s*$/i, '')            // SDM
    .replace(/\s*VAT\s+Charges\s*$/i, '')  // VAT Charges
    .replace(/[-–\s]+$/, '')
    .trim();

  return cleaned.length > 2 ? cleaned : null;
}
