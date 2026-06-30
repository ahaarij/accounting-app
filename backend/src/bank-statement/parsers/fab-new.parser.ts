import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText, ensureNewestFirst } from './types';

export function parseFABNew(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n');

  // ── Header ────────────────────────────────────────────────────────────────
  const accountNumber = fullText.match(/Account Number\s+(\d{10,20})/i)?.[1] ?? 'UNKNOWN';
  const iban = fullText.match(/\b(AE\d{2}[0-9]{20})\b/)?.[1] ?? null;
  const holderName = fullText.match(/Account Name\s+([A-Z][A-Z ]+(?:LLC|FZE|LTD|CO|WLL))\b/i)?.[1]?.trim()
    ?? fullText.match(/([A-Z][A-Z ]+(?:LLC|FZE|LTD|CO|WLL))\b/)?.[1]?.trim()
    ?? 'UNKNOWN';
  const currency = fullText.match(/\bCurrency\s+(AED|USD|EUR)\b/i)?.[1] ?? 'AED';

  // Period from the "Payment Date From ... To ..." line
  const periodMatch = fullText.match(/Payment Date From\s+(\d{2}-\d{2}-\d{4})\s+To\s+(\d{2}-\d{2}-\d{4})/i);
  const periodFrom = periodMatch ? parseDate(periodMatch[1]) : null;
  const periodTo = periodMatch ? parseDate(periodMatch[2]) : null;

  // ── Transaction blocks ────────────────────────────────────────────────────
  // Each block starts with a line: DD-MM-YYYY  DD-MM-YYYY  (narrative begins here)
  // Each block ends with a line:   {ref1}  {ref2}  {debit}  {credit}  {balance}
  const TX_START = /^(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s*(.*)/;
  // Amounts line: two non-space tokens (refs) then three money amounts
  const AMOUNTS_LINE = /^(\S+)\s+(\S+)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;

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
  let current: Partial<Block> & { narrativeLines: string[] } | null = null;
  let inStatements = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // Find the table section (skip header pages)
    if (/^Transaction\s*$|^Date\s*$|^Payment Date From/i.test(line)) {
      inStatements = true;
      continue;
    }

    const startM = line.match(TX_START);
    if (startM) {
      inStatements = true;
      // Save previous block if complete
      if (current?.date) blocks.push(current as Block);
      current = {
        date: parseDate(startM[1]) ?? startM[1],
        valueDate: parseDate(startM[2]) ?? startM[2],
        narrativeLines: startM[3] ? [startM[3]] : [],
        bankRef: '',
        channelRef: '',
        debit: null,
        credit: null,
        balance: null,
      };
      continue;
    }

    if (!current) continue;

    const amtM = line.match(AMOUNTS_LINE);
    if (amtM) {
      current.bankRef = amtM[1];
      current.channelRef = amtM[2];
      current.debit = parseNum(amtM[3]) || null;   // 0.00 → null
      current.credit = parseNum(amtM[4]) || null;
      current.balance = parseNum(amtM[5]);
      blocks.push(current as Block);
      current = null;
    } else if (line && !/^FAB CORPORATE|^Page \d|^Account Information/i.test(line)) {
      current.narrativeLines.push(line);
    }
  }
  if (current?.date) blocks.push(current as Block);

  // ── Convert blocks to ParsedTransaction ───────────────────────────────────
  const transactions: ParsedTransaction[] = blocks.map(b => {
    const narrative = cleanText(b.narrativeLines.join(' '));
    const cls = classifyFABNew(narrative, b.debit, b.credit, b.bankRef);

    // FX fields
    const trfCcy = narrative.match(/Trf Ccy:\s*([A-Z]{3})/i)?.[1] ?? null;
    const trfAmt = narrative.match(/Trf Amt:\s*([\d.]+)/i)?.[1] ?? null;
    const fx_original_currency = trfCcy && trfCcy !== currency ? trfCcy : null;
    const fx_original_amount = fx_original_currency && trfAmt ? parseNum(trfAmt) : null;

    return {
      date: b.date,
      value_date: b.valueDate,
      narration: cls.narration ?? narrative,
      counterparty: cls.counterparty,
      transaction_type: cls.type,
      reference: b.bankRef || null,
      charge_ref: b.bankRef || null,
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
    closing_balance: transactions.length ? transactions[transactions.length - 1].running_balance : null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  // PDFs are oldest-first; reverse so newest = lowest id, matching the id DESC service sort
  ensureNewestFirst(transactions);

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
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
  bankRef: string,
): FABNewClassified {
  // Bank charges
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

  // Inward remittance — "Remitter Info: COMPANY NAME" in structured narrative
  const remitterRaw = narrative.match(/Remitter Info:\s*(.+)/i)?.[1];
  const remitterCp = remitterRaw
    ? cleanText(remitterRaw
        .split(/,?\s*(?=Sender:|Value Date:|Trf Ccy:|Pay Dtls:|Ord Inst:)/i)[0]
        .replace(/\s+-\s+First\s*$/i, ''))
    : null;
  if (remitterCp && credit) {
    const payDtls = narrative.match(/Pay Dtls:\s*(.+?)(?:,\s*(?:Ord Inst:|$)|$)/i)?.[1]?.trim() ?? null;
    const sender = narrative.match(/Sender:\s*([A-Z]{4,})/i)?.[1] ?? null;
    const narration = [
      'Inward transfer',
      `from ${remitterCp}`,
      sender ? `via ${sender}` : null,
      payDtls ? `· ${payDtls}` : null,
    ].filter(Boolean).join(' ');
    return { type: 'INWARD_TRANSFER', counterparty: remitterCp, isCharge: false, narration };
  }

  // Outward remittance with beneficiary details
  const benefMatch = narrative.match(/Beneficiary Details are:\s*[^,]+,\s*([^,]+)/i);
  if (benefMatch && debit) {
    const counterparty = cleanText(benefMatch[1]);
    return {
      type: 'OUTWARD_TRANSFER',
      counterparty,
      isCharge: false,
      narration: `Outward transfer to ${counterparty}`,
    };
  }

  // IPI (Intra-Bank Payment Instruction) inward
  if (/^IPI\b/i.test(narrative) && credit) {
    const remitterIpiRaw = narrative.match(/Remitter Info:\s*(.+)/i)?.[1];
    const remitterIpi = remitterIpiRaw
      ? cleanText(remitterIpiRaw.split(/,?\s*(?=Sender:|Value Date:|Trf Ccy:|Pay Dtls:|Ord Inst:)/i)[0].replace(/\s+-\s+First\s*$/i, ''))
      : null;
    return {
      type: 'INWARD_TRANSFER',
      counterparty: remitterIpi,
      isCharge: false,
      narration: remitterIpi ? `Inward transfer from ${remitterIpi}` : 'Inward transfer (IPI)',
    };
  }

  // Simple outward (501PY-... reference code only, no structured narration)
  if (debit && !credit) {
    return { type: 'OUTWARD_TRANSFER', counterparty: null, isCharge: false, narration: narrative || 'Outward transfer' };
  }

  return { type: credit ? 'INWARD_TRANSFER' : 'OUTWARD_TRANSFER', counterparty: null, isCharge: false, narration: narrative || null };
}
