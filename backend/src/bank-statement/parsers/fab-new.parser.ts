import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText, ensureNewestFirst } from './types';

// Lines stripped from each page chunk before block accumulation (case-insensitive)
const BOILERPLATE_RE = /^(?:Account Details$|Account Information$|Account Number\b|Old Account Number$|Bank\s*-\s*Branch Name$|BIC$|Balance Information$|Previous Day Balance$|Available Balance$|Overdraft Limit$|View Statement$|Total Search Results$|Payment Date From\b|Currency\s+[A-Z]{3}$|Account Name\b|Transaction$|Date$|Payment$|Narrative Bank Reference Channel$|Reference$|Debit Credit Running$|Balance$|FAB CORPORATE ONLINE BANKING\b|Report generated on\b)/i;

export function parseFABNew(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');

  // ── Header extraction (from raw text before stripping) ────────────────────
  const accountNumber = fullText.match(/Account Number\s+(\d{10,20})/i)?.[1] ?? 'UNKNOWN';
  const iban = fullText.match(/\b(AE\d{2}[0-9]{20})\b/)?.[1] ?? null;
  const holderName =
    fullText.match(/Account Name\s+([A-Z][A-Z &.]+(?:LLC|FZE|LTD|CO|WLL))\b/i)?.[1]?.trim() ??
    fullText.match(/([A-Z][A-Z &.]+(?:LLC|FZE|LTD|CO|WLL))\b/)?.[1]?.trim() ??
    'UNKNOWN';
  const currency = fullText.match(/\bCurrency\s+(AED|USD|EUR)\b/i)?.[1] ?? 'AED';
  const periodMatch = fullText.match(/Payment Date From\s+(\d{2}-\d{2}-\d{4})\s+To\s+(\d{2}-\d{2}-\d{4})/i);
  const periodFrom = periodMatch ? parseDate(periodMatch[1]) : null;
  const periodTo = periodMatch ? parseDate(periodMatch[2]) : null;

  // ── Split by page markers, strip boilerplate from each chunk ──────────────
  const chunks = fullText.split(/--\s*\d+\s+of\s+\d+\s*--/i);
  const cleanedLines: string[] = [];
  for (const chunk of chunks) {
    for (const rawLine of chunk.split('\n')) {
      const line = rawLine.trim();
      if (!line || BOILERPLATE_RE.test(line)) continue;
      cleanedLines.push(line);
    }
  }

  // ── Block accumulation ────────────────────────────────────────────────────
  const TX_START = /^(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s*(.*)/;
  // Separate amounts line: bankRef  channelRef  debit  credit  balance
  // Balance uses -? to allow negative running balance (account can go into overdraft)
  const AMOUNTS_LINE = /^(\S+)\s+(\S+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$/;
  // Single-line: narrative + amounts on same line as the date fields
  const INLINE_AMOUNTS = /^(.*?)\s+(\S+)\s+(\S+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s*$/;

  interface Block {
    date: string;
    valueDate: string;
    narrativeLines: string[];
    bankRef: string;
    channelRef: string;
    debit: number | null;
    credit: number | null;
    balance: number | null;
  }

  const blocks: Block[] = [];
  let current: (Partial<Block> & { narrativeLines: string[] }) | null = null;

  for (const line of cleanedLines) {
    const startM = line.match(TX_START);
    if (startM) {
      if (current?.date) blocks.push(current as Block);

      const rest = startM[3] ?? '';
      const inlineM = rest ? rest.match(INLINE_AMOUNTS) : null;

      if (inlineM) {
        // Format D / E: all on one line — date date narrative bankRef channelRef debit credit balance
        blocks.push({
          date: parseDate(startM[1]) ?? startM[1],
          valueDate: parseDate(startM[2]) ?? startM[2],
          narrativeLines: inlineM[1] ? [inlineM[1]] : [],
          bankRef: inlineM[2],
          channelRef: inlineM[3],
          debit: parseNum(inlineM[4]) || null,
          credit: parseNum(inlineM[5]) || null,
          balance: parseNum(inlineM[6]),
        });
        current = null;
      } else {
        current = {
          date: parseDate(startM[1]) ?? startM[1],
          valueDate: parseDate(startM[2]) ?? startM[2],
          narrativeLines: rest ? [rest] : [],
          bankRef: '',
          channelRef: '',
          debit: null,
          credit: null,
          balance: null,
        };
      }
      continue;
    }

    if (!current) continue;

    const amtM = line.match(AMOUNTS_LINE);
    if (amtM) {
      current.bankRef = amtM[1];
      current.channelRef = amtM[2];
      current.debit = parseNum(amtM[3]) || null;
      current.credit = parseNum(amtM[4]) || null;
      current.balance = parseNum(amtM[5]);
      blocks.push(current as Block);
      current = null;
    } else {
      current.narrativeLines.push(line);
    }
  }
  if (current?.date) blocks.push(current as Block);

  // ── Convert blocks → ParsedTransaction ────────────────────────────────────
  const transactions: ParsedTransaction[] = blocks.map(b => {
    const narrative = cleanText(b.narrativeLines.join(' '));
    const cls = classifyFABNew(narrative, b.debit, b.credit);

    const trfCcy = narrative.match(/Trf Ccy:\s*([A-Z]{3})/i)?.[1] ?? null;
    const trfAmt = narrative.match(/Trf Amt:\s*([\d.,]+)/i)?.[1] ?? null;
    const fx_original_currency = trfCcy && trfCcy !== currency ? trfCcy : null;
    const fx_original_amount = fx_original_currency && trfAmt ? parseNum(trfAmt) : null;

    // Charges need charge_ref = channelRef so the service can link them to their parent.
    // Parents (OUTWARD_TRANSFER with associated /REF/ALLOWANCE charges) must use channelRef
    // as their reference so the service's refToParentId map uses the same key the charge looks up.
    const ref = cls.isCharge ? (b.bankRef || null) : (b.channelRef || b.bankRef || null);
    const chargeRef = b.channelRef || b.bankRef || null;

    return {
      date: b.date,
      value_date: b.valueDate,
      narration: cls.narration ?? narrative,
      counterparty: cls.counterparty,
      transaction_type: cls.type,
      reference: ref,
      charge_ref: chargeRef,
      debit: b.debit,
      credit: b.credit,
      running_balance: b.balance,
      is_charge: cls.isCharge,
      fx_rate: null,
      fx_original_amount,
      fx_original_currency,
    };
  });

  const account: ParsedAccount = {
    iban,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'First Abu Dhabi Bank',
    currency,
    opening_balance: null,
    // Computed before ensureNewestFirst so last item = most recent tx (PDF is oldest-first)
    closing_balance: transactions.length ? transactions[transactions.length - 1].running_balance : null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  ensureNewestFirst(transactions);

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
}

// ── Beneficiary details parser ─────────────────────────────────────────────────

function parseBeneficiary(narrative: string): { company: string | null; bank: string | null } {
  const m = narrative.match(/Beneficiary Details are\s*:\s*(.+)/is);
  if (!m) return { company: null, bank: null };

  const fields = m[1].split(',').map(f => cleanText(f));
  // fields: [0]=IBAN, [1]=company name, [2]=city+country, [3]=full country, [4]=bank name, [5]=bank country
  let rawCompany = fields[1] ?? null;
  const rawBank = fields[4] ?? null;

  // Fix PDF line-wrap space artifact: "I NFINITY FORTUNE" → "INFINITY FORTUNE"
  // When pdf-parse wraps a long line, a single leading capital letter gets separated from
  // the rest of the word by a space (e.g. the word "INFINITY" wraps as "I" + " NFINITY")
  if (rawCompany) {
    rawCompany = rawCompany.replace(/^([A-Z])\s+([A-Z]{2,})/, '$1$2');
  }

  return {
    company: rawCompany ? cleanText(rawCompany) : null,
    bank: rawBank ? cleanText(rawBank) : null,
  };
}

// ── Classifier ────────────────────────────────────────────────────────────────

interface FABNewClassified {
  type: string;
  counterparty: string | null;
  isCharge: boolean;
  narration: string | null;
}

function classifyFABNew(
  narrative: string,
  debit: number | null,
  credit: number | null,
): FABNewClassified {
  // Format E — /REF/ALLOWANCE transfer fee (single-line charge preceding an OUTWARD TRANSFER)
  if (/^\/REF\/ALLOWANCE\b/i.test(narrative)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true, narration: 'Transfer charge' };
  }

  // Named bank charges
  if (/MONTHLY ELECTRONIC BANKING FEE/i.test(narrative)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true, narration: 'Monthly electronic banking fee' };
  }
  if (/Minimum Balance Charge/i.test(narrative)) {
    return { type: 'MONTHLY_CHARGE', counterparty: null, isCharge: true, narration: 'Minimum balance charge' };
  }
  if (/Tax Amount Due/i.test(narrative)) {
    return { type: 'VAT_CHARGE', counterparty: null, isCharge: true, narration: 'Tax (VAT) on charges' };
  }
  if (/ACCOUNT MAINTENANCE FEE/i.test(narrative)) {
    return { type: 'MONTHLY_CHARGE', counterparty: null, isCharge: true, narration: 'Account maintenance fee' };
  }
  if (/OUTWARD TELEX CHARGE|TELEX CHARGE/i.test(narrative)) {
    return { type: 'BANK_CHARGE', counterparty: null, isCharge: true, narration: 'Outward telex charge' };
  }

  // Format A — Inward with structured Remitter Info (EPHCOP-style)
  const remitterRaw =
    narrative.match(/Remitter\s+Info:\s*(.+)/i)?.[1] ??
    narrative.match(/Remitter:\s*(.+)/i)?.[1];
  if (remitterRaw && credit) {
    const cp = cleanText(
      remitterRaw
        .split(/,?\s*(?=Sender:|Value Date:|Trf Ccy:|Pay Dtls:|Ord Inst:)/i)[0]
        .replace(/\s+-\s+First\s*$/i, ''),
    );
    const payDtls = narrative.match(/Pay Dtls:\s*(.+?)(?:,\s*(?:Ord Inst:|$)|$)/i)?.[1]?.trim() ?? null;
    const sender = narrative.match(/Sender:\s*([A-Z]{4,})/i)?.[1] ?? null;
    const narration = [
      'Inward transfer',
      `from ${cp}`,
      sender ? `via ${sender}` : null,
      payDtls ? `· ${payDtls}` : null,
    ]
      .filter(Boolean)
      .join(' ');
    return { type: 'INWARD_TRANSFER', counterparty: cp, isCharge: false, narration };
  }

  // Format B — Outward UAE transfer with Beneficiary Details block
  if (/OUTWARD TRANSFER INSIDE UAE/i.test(narrative) || /Beneficiary Details are/i.test(narrative)) {
    const { company, bank } = parseBeneficiary(narrative);
    const bankNote = bank ? ` (via ${bank})` : '';
    return {
      type: 'OUTWARD_TRANSFER',
      counterparty: company,
      isCharge: false,
      narration: company ? `Outward transfer to ${company}${bankNote}` : 'Outward transfer',
    };
  }

  // Format C — 501PY standing orders (recurring scheduled payments)
  if (/\b501PY-/i.test(narrative)) {
    return { type: 'OUTWARD_TRANSFER', counterparty: null, isCharge: false, narration: 'Standing order payment' };
  }

  // IPI (Intra-Bank Payment Instruction) inward
  if (/^IPI\b/i.test(narrative) && credit) {
    const ipiRaw = narrative.match(/Remitter\s+Info:\s*(.+)/i)?.[1];
    const cp = ipiRaw
      ? cleanText(
          ipiRaw
            .split(/,?\s*(?=Sender:|Value Date:|Trf Ccy:|Pay Dtls:|Ord Inst:)/i)[0]
            .replace(/\s+-\s+First\s*$/i, ''),
        )
      : null;
    return {
      type: 'INWARD_TRANSFER',
      counterparty: cp,
      isCharge: false,
      narration: cp ? `Inward transfer from ${cp}` : 'Inward transfer (IPI)',
    };
  }

  // Cheque credit (Format D single-line inward)
  if (/Cheque no/i.test(narrative) && credit) {
    return { type: 'INWARD_TRANSFER', counterparty: null, isCharge: false, narration: cleanText(narrative) };
  }

  // Format D generic fallback
  if (debit && !credit) {
    return { type: 'OUTWARD_TRANSFER', counterparty: null, isCharge: false, narration: narrative || 'Outward transfer' };
  }
  return {
    type: credit ? 'INWARD_TRANSFER' : 'OUTWARD_TRANSFER',
    counterparty: null,
    isCharge: false,
    narration: narrative || null,
  };
}
