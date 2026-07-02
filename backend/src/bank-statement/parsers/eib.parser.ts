import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText } from './types';

export function parseEIB(pages: string[]): ParsedStatement {
  const fullText = pages.join('\n');
  const lines = fullText.split('\n').map(l => l.trim());

  // ── Header extraction ─────────────────────────────────────────────────────
  const iban = fullText.match(/\b(AE\d{21})\b/)?.[1] ?? null;
  const accountNumber = iban
    ? (iban.slice(7).replace(/^0+/, '') || iban.slice(7))
    : fullText.match(/\b(\d{13,14})\b/)?.[1] ?? 'UNKNOWN';
  const currency = fullText.match(/^(AED|USD|EUR)$/m)?.[1] ?? 'AED';
  const holderName = extractCompanyName(fullText);

  let periodFrom: string | null = null;
  let periodTo: string | null = null;
  const periodMatch = fullText.match(/From[:\s]+(\d{2}-\d{2}-\d{4})\s+[Tt]o\s+(\d{2}-\d{2}-\d{4})/i);
  if (periodMatch) {
    periodFrom = parseDate(periodMatch[1]);
    periodTo = parseDate(periodMatch[2]);
  }

  const account: ParsedAccount = {
    iban,
    account_number: accountNumber,
    holder_name: holderName,
    bank_name: 'Emirates Islamic Bank',
    currency,
    opening_balance: null,
    closing_balance: null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  // ── Transaction parsing ───────────────────────────────────────────────────
  // EIB format: date + numbers on same line, narration on subsequent lines
  const DATE_NUMS_LINE = /^(\d{2}-\d{2}-\d{4})\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+(\d{2}-\d{2}-\d{4})\s+([\d,]+\.?\d*)$/;

  const transactions: ParsedTransaction[] = [];
  let i = 0;

  // Page-header lines that appear between a TX line and its continuation on the next page
  const PAGE_HEADER_RE = /^(Narration Running|Balance|Value Date|Transaction|Date Credit)/i;

  while (i < lines.length) {
    const line = lines[i];
    const m = line.match(DATE_NUMS_LINE);
    if (!m) { i++; continue; }

    const txDate = parseDate(m[1]);
    if (!txDate) { i++; continue; }

    const creditVal = parseNum(m[2]);
    const debitVal = parseNum(m[3]);
    const valueDate = parseDate(m[4]);
    const balance = parseNum(m[5]);

    i++;
    const narrationLines: string[] = [];
    while (i < lines.length && !lines[i].match(DATE_NUMS_LINE)) {
      if (lines[i] && !PAGE_HEADER_RE.test(lines[i])) narrationLines.push(lines[i]);
      i++;
    }

    // EIB page-break: the TX line is repeated at the top of the next page.
    // Detect by matching all key fields of the previous transaction.
    const prev = transactions[transactions.length - 1];
    if (
      prev &&
      prev.date === txDate &&
      (prev.credit ?? 0) === (creditVal ?? 0) &&
      (prev.debit ?? 0) === (debitVal ?? 0) &&
      prev.running_balance === balance
    ) {
      // Append any new narration info (payment purpose, beneficiary) to the existing tx
      const addl = cleanText(narrationLines.join(' '));
      if (addl) {
        const combinedNarration = prev.narration
          ? cleanText(prev.narration + ' ' + addl)
          : addl;
        const reparsed = parseEIBNarration(combinedNarration);
        prev.narration = reparsed.description ?? combinedNarration;
        if (reparsed.counterparty && !prev.counterparty) prev.counterparty = reparsed.counterparty;
        if (reparsed.transaction_type !== 'OTHER') prev.transaction_type = reparsed.transaction_type;
      }
      continue;
    }

    const rawNarration = cleanText(narrationLines.join(' '));
    const ephcop = extractEPHCOP(rawNarration);
    const parsed = parseEIBNarration(rawNarration);

    transactions.push({
      date: txDate,
      value_date: valueDate,
      narration: parsed.description ?? rawNarration,
      counterparty: parsed.counterparty,
      transaction_type: parsed.transaction_type,
      reference: ephcop,
      charge_ref: ephcop,
      debit: debitVal && debitVal > 0 ? debitVal : null,
      credit: creditVal && creditVal > 0 ? creditVal : null,
      running_balance: balance,
      is_charge: parsed.is_charge,
      fx_rate: parsed.fx_rate,
      fx_original_amount: parsed.fx_original_amount,
      fx_original_currency: parsed.fx_original_currency,
    });
  }

  if (transactions.length) {
    account.closing_balance = transactions[transactions.length - 1].running_balance;
  }

  const txMap = new Map<string, ParsedTransaction[]>();
  txMap.set(accountNumber, transactions);
  return { accounts: [account], transactions: txMap };
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

function extractEPHCOP(narration: string): string | null {
  const m = narration.match(/EPHCOP[A-Z0-9]+/i);
  return m ? m[0].toUpperCase() : null;
}

// ── Narration parser ──────────────────────────────────────────────────────────

interface ParsedNarration {
  transaction_type: string;
  counterparty: string | null;
  is_charge: boolean;
  description: string | null;
  fx_rate: number | null;
  fx_original_amount: number | null;
  fx_original_currency: string | null;
}

function parseEIBNarration(narration: string): ParsedNarration {
  const n = narration;

  // ── IFT-DTB: International outward ──────────────────────────────────────
  const iftMatch = n.match(/IFT-DTB\s+TT\s+REF\s+\S+\s+\d+\s+(.+?)\s+([A-Z]{3})([\d,]+)@([\d.]+)/i);
  if (iftMatch) {
    const rawBody = iftMatch[1].trim();
    const fxCcy = iftMatch[2].toUpperCase();
    const fxAmt = parseFloat(iftMatch[3].replace(/,/g, ''));
    const fxRate = parseFloat(iftMatch[4]);
    const { counterparty, country } = splitCounterpartyGeography(rawBody);
    const desc = [
      'Intl transfer',
      `${fxCcy} ${fxAmt.toLocaleString('en-AE', { minimumFractionDigits: 2 })} @ ${fxRate}`,
      country,
    ].filter(Boolean).join(' · ');
    return { transaction_type: 'OUTWARD_INTERNATIONAL', counterparty, is_charge: false, description: desc, fx_rate: fxRate, fx_original_amount: fxAmt, fx_original_currency: fxCcy };
  }

  // ── DFT-DTB: Domestic outward ────────────────────────────────────────────
  const dftMatch = n.match(/DFT-DTB\s+TT\s+REF\s+\S+\s+\d+\s+(.+?)\s+([A-Z]{2,4})\s+(.+?)\s+(?:AED|USD|EUR)\s+\d+-/i);
  if (dftMatch) {
    const counterparty = cleanText(dftMatch[1]);
    const purposeDesc = cleanText(dftMatch[3]);
    const desc = purposeDesc && purposeDesc !== '--' ? `Local transfer · ${purposeDesc}` : 'Local transfer';
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty, is_charge: false, description: desc, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }
  if (/^DFT/i.test(n)) {
    const counterparty = extractCounterpartyAfterBankId(n.replace(/^DFT-DTB\s+TT\s+REF\s+\S+\s+\d+\s+/i, ''));
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty, is_charge: false, description: 'Local transfer', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── TRANSFER: Bank fees (must check before generic TRANSFER catch-all) ───
  if (/^TRANSFERBUB\b/i.test(n)) {
    const period = n.match(/(\d{2}\/\d{4})/)?.[1];
    const desc = period ? `Relationship fee · ${period}` : 'Relationship fee';
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: desc, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }
  if (/^TRANSFERMIN\s+BAL\s+FEE\b/i.test(n)) {
    const period = n.match(/(\d{2}\/\d{4})/)?.[1];
    const desc = period ? `Minimum balance fee · ${period}` : 'Minimum balance fee';
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: desc, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── TRANSFER: Internal ───────────────────────────────────────────────────
  const transferMatch = n.match(/TRANSFER.*?TO\s+A\s+C\s+(\d+)/i);
  if (transferMatch) {
    return { transaction_type: 'INTERNAL_TRANSFER', counterparty: null, is_charge: false, description: `Internal transfer to A/C ${transferMatch[1]}`, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }
  if (/^TRANSFER/i.test(n)) {
    return { transaction_type: 'INTERNAL_TRANSFER', counterparty: null, is_charge: false, description: 'Internal transfer', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── IPP Customer Credit: inward via InstantPay (ENBD-style column concat) ─
  const ippMatch = n.match(/IPP\s+Customer\s+Credit\s*IPP\s+\S+\s+\d+\s+(AED|USD|EUR)\s+([\d,]+)\s+(.+?)\s+\d+-[\d]+-\d+-\d+/i);
  if (ippMatch) {
    const ccy = ippMatch[1];
    const amt = parseFloat(ippMatch[2].replace(/,/g, ''));
    const counterparty = cleanText(ippMatch[3]);
    return { transaction_type: 'INWARD_TRANSFER', counterparty, is_charge: false, description: `Inward · ${ccy} ${amt.toLocaleString('en-AE', { minimumFractionDigits: 2 })} via InstantPay`, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }
  // IPP credit transaction (EIB column-concat format: hash may contain a space)
  const ippCreditMatch = n.match(/IPP\s+credit\s+transaction\s*IPP\s+.+?\s+(AED|USD|EUR)\s+([\d,]+)/i);
  if (ippCreditMatch) {
    return { transaction_type: 'INWARD_TRANSFER', counterparty: null, is_charge: false, description: 'Inward via InstantPay', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── INWARD REMITTANCE ────────────────────────────────────────────────────
  // Handles column concat: "INWARD REMITTANCETT REF:" and /REF/ terminator
  const inwardMatch = n.match(/INWARD\s+REMITTANCE\s*TT\s+REF:\s*\S+\s+(AED|USD|EUR)\s+([\d,]+)\s+(.+?)(?:\s+\/REF\/.*|\s+\d{4}-\d+-\d+-\d+|$)/i);
  if (inwardMatch) {
    const ccy = inwardMatch[1];
    const amt = parseFloat(inwardMatch[2].replace(/,/g, ''));
    const counterparty = stripPaymentPurpose(cleanText(inwardMatch[3]));
    return { transaction_type: 'INWARD_TRANSFER', counterparty, is_charge: false, description: `Inward remittance · ${ccy} ${amt.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── CASH DEPOSIT ─────────────────────────────────────────────────────────
  if (/CASH\s+DEPOSIT|CDMSDM|CDM/i.test(n)) {
    const branchMatch = n.match(/;\s*([^;]+?)\s+BRANCH/i);
    const counterparty = branchMatch ? `CDM · ${cleanText(branchMatch[1])} Branch` : 'CDM';
    return { transaction_type: 'CASH_DEPOSIT', counterparty, is_charge: false, description: 'Cash deposit', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── Charges with FX ──────────────────────────────────────────────────────
  if (/^CHARGES?\s*(?:EPHCOP|DTB)/i.test(n)) {
    const corrMatch = n.match(/([A-Z]{3})([\d,]+)@([\d.]+)/);
    if (corrMatch) {
      const fxCcy = corrMatch[1];
      const fxAmt = parseFloat(corrMatch[2].replace(/,/g, ''));
      const fxRate = parseFloat(corrMatch[3]);
      return {
        transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true,
        description: `Correspondent charges · ${fxCcy} ${fxAmt.toLocaleString('en-AE', { minimumFractionDigits: 2 })} @ ${fxRate}`,
        fx_rate: fxRate, fx_original_amount: fxAmt, fx_original_currency: fxCcy,
      };
    }
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: 'Bank charge', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  if (/VALUE\s+ADDED\s+TAX|VAT/i.test(n)) {
    return { transaction_type: 'VAT_CHARGE', counterparty: null, is_charge: true, description: 'VAT on bank charges', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }
  if (/^CHARGES?/i.test(n)) {
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: 'Bank charge', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  return { transaction_type: 'OTHER', counterparty: null, is_charge: false, description: null, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const GEO_WORDS = new Set([
  'UNITED', 'STATES', 'KINGDOM', 'AMERICA', 'INDIA', 'CHINA', 'PAKISTAN', 'UK', 'USA', 'UAE',
  'LONDON', 'MUMBAI', 'DELHI', 'DUBAI', 'SINGAPORE', 'HONG', 'KONG', 'FRANCE', 'GERMANY',
  'JAPAN', 'KOREA', 'TURKEY', 'EGYPT', 'JORDAN', 'SAUDI', 'ARABIA', 'KINGDO', 'EMIRATE',
  'EMIRATES', 'BANGLADESH', 'SRI', 'LANKA',
]);

function splitCounterpartyGeography(text: string): { counterparty: string; country: string | null } {
  const suffixMatch = text.match(
    /^(.+?(?:LLC|L\.L\.C\.?|L\s+L\s+C|LIMITED|LTD|TRADING|ENTERPRISE\w*|FZCO|FZE|CORP\.?|INC\.?|GROUP|WHOLESALER\w*|COMPANY|CO\.))\s*(.*)/i
  );
  if (suffixMatch) {
    return { counterparty: cleanText(suffixMatch[1]), country: tidyGeography(suffixMatch[2].trim()) };
  }
  const words = text.split(/\s+/);
  let geoStart = words.length;
  for (let i = words.length - 1; i >= 1; i--) {
    if (/^[A-Z]{2}$/.test(words[i]) || GEO_WORDS.has(words[i].toUpperCase())) {
      geoStart = i;
    } else break;
  }
  return {
    counterparty: cleanText(words.slice(0, geoStart).join(' ')) || text,
    country: tidyGeography(words.slice(geoStart).join(' ')),
  };
}

function tidyGeography(geo: string): string | null {
  if (!geo) return null;
  const cleaned = geo
    .replace(/\b[A-Z]{2}\b/g, '')
    .replace(/\b(mum|del|hkg|sgp|bom|lhr|dxb)\b/gi, '')
    .replace(/UNITED\s+KINGDO\b/gi, 'United Kingdom')
    .replace(/UNITED\s+KINGDOM/gi, 'United Kingdom')
    .replace(/UNITED\s+STATES\s+OF\s+AMERICA/gi, 'United States')
    .replace(/UNITED\s+ARAB\s+EMIRATES?/gi, 'UAE')
    .replace(/\s+/g, ' ').trim();
  return cleaned || null;
}

function extractCounterpartyAfterBankId(text: string): string | null {
  const m = text.match(/^(.+?(?:LLC|L\.L\.C\.?|LIMITED|LTD|FZCO|FZE|TRADING|GROUP))/i);
  return m ? cleanText(m[1]) : cleanText(text.split(/\s+/).slice(0, 4).join(' ')) || null;
}

function stripPaymentPurpose(raw: string): string {
  return cleanText(
    raw
      .replace(/\s+BANK\s+\S+.*$/i, '')
      .replace(/\s+\/REF\/.*$/i, '')
      .replace(/\s+PAYMENT\s+AGAINST.*$/i, '')
      .replace(/\s+PO\s+BOX.*$/i, '')
  ) || raw;
}
