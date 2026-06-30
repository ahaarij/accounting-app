import { ParsedStatement, ParsedAccount, ParsedTransaction, parseDate, parseNum, cleanText } from './types';

export function parseENBD(pages: string[]): ParsedStatement {
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
    bank_name: 'Emirates NBD',
    currency,
    opening_balance: null,
    closing_balance: null,
    period_from: periodFrom,
    period_to: periodTo,
  };

  // ── Transaction parsing ───────────────────────────────────────────────────
  const STANDALONE_DATE = /^(\d{2}-\d{2}-\d{4})$/;
  const NUMBERS_LINE = /^([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+([\d,]+\.?\d*)\s+(\d{2}-\d{2}-\d{4})$/;

  const transactions: ParsedTransaction[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (!STANDALONE_DATE.test(line)) { i++; continue; }

    const txDate = parseDate(line);
    if (!txDate) { i++; continue; }

    const narrationLines: string[] = [];
    i++;
    while (i < lines.length && !STANDALONE_DATE.test(lines[i])) {
      const l = lines[i];
      const nm = l.match(NUMBERS_LINE);
      if (nm) {
        const debitVal = parseNum(nm[1]);
        const balance = parseNum(nm[2]);
        const creditVal = parseNum(nm[3]);
        const valueDate = parseDate(nm[4]);

        const rawNarration = cleanText(narrationLines.join(' '));
        const ephcop = extractEPHCOP(rawNarration);
        const parsed = parseENBDNarration(rawNarration);

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
        i++;
        break;
      } else {
        if (l) narrationLines.push(l);
        i++;
      }
    }
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

function parseENBDNarration(narration: string): ParsedNarration {
  const n = narration;

  // ── IFT-DTB: International outward transfer ──────────────────────────────
  // Format: IFT-DTB TT REF {EPHCOP} {bankid} {company} {geography} [{CC}] {CCY}{amt}@{rate}
  const iftMatch = n.match(/IFT-DTB\s+TT\s+REF\s+\S+\s+\d+\s+(.+?)\s+([A-Z]{3})([\d,]+)@([\d.]+)/i);
  if (iftMatch) {
    const rawBody = iftMatch[1].trim();
    const fxCcy = iftMatch[2].toUpperCase();
    const fxAmt = parseFloat(iftMatch[3].replace(/,/g, ''));
    const fxRate = parseFloat(iftMatch[4]);
    const { counterparty, country } = splitCounterpartyGeography(rawBody);
    const desc = [
      `Intl transfer`,
      `${fxCcy} ${fxAmt.toLocaleString('en-AE', { minimumFractionDigits: 2 })} @ ${fxRate}`,
      country,
    ].filter(Boolean).join(' · ');
    return { transaction_type: 'OUTWARD_INTERNATIONAL', counterparty, is_charge: false, description: desc, fx_rate: fxRate, fx_original_amount: fxAmt, fx_original_currency: fxCcy };
  }

  // ── DFT-DTB: Domestic outward transfer ──────────────────────────────────
  // Format: DFT-DTB TT REF {EPHCOP} {bankid} {company} {purpose_code} {purpose_desc} AED {uetr}
  const dftMatch = n.match(/DFT-DTB\s+TT\s+REF\s+\S+\s+\d+\s+(.+?)\s+([A-Z]{2,4})\s+(.+?)\s+(?:AED|USD|EUR)\s+\d+-/i);
  if (dftMatch) {
    const counterparty = cleanText(dftMatch[1]);
    const purposeDesc = cleanText(dftMatch[3]);
    const desc = purposeDesc && purposeDesc !== '--'
      ? `Local transfer · ${purposeDesc}`
      : 'Local transfer';
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty, is_charge: false, description: desc, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }
  // Fallback DFT without full structure
  if (/^DFT/i.test(n)) {
    const counterparty = extractCounterpartyAfterBankId(n.replace(/^DFT-DTB\s+TT\s+REF\s+\S+\s+\d+\s+/i, ''));
    return { transaction_type: 'OUTWARD_TRANSFER', counterparty, is_charge: false, description: 'Local transfer', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── TRANSFER-DTB: Internal ENBD-to-ENBD transfer ─────────────────────────
  const transferMatch = n.match(/TRANSFER.*?TO\s+A\s+C\s+(\d+)/i);
  if (transferMatch) {
    return { transaction_type: 'INTERNAL_TRANSFER', counterparty: null, is_charge: false, description: `Internal transfer to A/C ${transferMatch[1]}`, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }
  if (/^TRANSFER/i.test(n)) {
    return { transaction_type: 'INTERNAL_TRANSFER', counterparty: null, is_charge: false, description: 'Internal transfer', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── IPP Customer Credit: inward via InstantPay ───────────────────────────
  // Format: IPP Customer Credit IPP {ippref} {bankid} {CCY} {amount} {sender} [{uetr}]
  // Column-concatenation produces "CreditIPP"; UETR at end is often truncated/absent
  const ippMatch = n.match(/IPP\s+Customer\s+Credit\s*IPP\s+.+?\s+(AED|USD|EUR)\s+([\d,]+)\s+(.+?)(?:\s+\d+-[\d]+-\d+-\d+|$)/i);
  if (ippMatch) {
    const ccy = ippMatch[1];
    const amt = parseFloat(ippMatch[2].replace(/,/g, ''));
    const counterparty = stripPaymentPurpose(cleanText(ippMatch[3]));
    return { transaction_type: 'INWARD_TRANSFER', counterparty, is_charge: false, description: `Inward · ${ccy} ${amt.toLocaleString('en-AE', { minimumFractionDigits: 2 })} via InstantPay`, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── INWARD REMITTANCE ────────────────────────────────────────────────────
  // Format: INWARD REMITTANCE TT REF: {ref} {CCY} {amount} {sender} [{/REF/...}|{uetr}]
  // Column-concat produces "REMITTANCETT"; /REF/ clause terminates sender name
  const inwardMatch = n.match(/INWARD\s+REMITTANCE\s*TT\s+REF:\s*\S+\s+(AED|USD|EUR)\s+([\d,]+)\s+(.+?)(?:\s+\/REF\/.*|\s+\d{4}-\d+-\d+-\d+|$)/i);
  if (inwardMatch) {
    const ccy = inwardMatch[1];
    const amt = parseFloat(inwardMatch[2].replace(/,/g, ''));
    const senderRaw = cleanText(inwardMatch[3]);
    const counterparty = stripPaymentPurpose(senderRaw);
    return { transaction_type: 'INWARD_TRANSFER', counterparty, is_charge: false, description: `Inward remittance · ${ccy} ${amt.toLocaleString('en-AE', { minimumFractionDigits: 2 })}`, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── CLEARING CHEQUE: inward cheque received ──────────────────────────────
  if (/CLEARING\s+CHEQUE\s*INWARD/i.test(n)) {
    return { transaction_type: 'INWARD_TRANSFER', counterparty: null, is_charge: false, description: 'Inward cheque', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── CASH DEPOSIT ─────────────────────────────────────────────────────────
  if (/CASH\s+DEPOSIT|CDMSDM|CDM/i.test(n)) {
    return { transaction_type: 'CASH_DEPOSIT', counterparty: 'CDM', is_charge: false, description: 'Cash deposit', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── Correspondent / TT charges with FX ──────────────────────────────────
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

  // ── VAT charge ──────────────────────────────────────────────────────────
  if (/VALUE\s+ADDED\s+TAX|VAT/i.test(n)) {
    return { transaction_type: 'VAT_CHARGE', counterparty: null, is_charge: true, description: 'VAT on bank charges', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  // ── Generic charge ───────────────────────────────────────────────────────
  if (/^CHARGES?/i.test(n)) {
    return { transaction_type: 'BANK_CHARGE', counterparty: null, is_charge: true, description: 'Bank charge', fx_rate: null, fx_original_amount: null, fx_original_currency: null };
  }

  return { transaction_type: 'OTHER', counterparty: null, is_charge: false, description: null, fx_rate: null, fx_original_amount: null, fx_original_currency: null };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Split "COMPANY NAME LLC UNITED STATES OF AMERICA US" into company + country
function splitCounterpartyGeography(text: string): { counterparty: string; country: string | null } {
  // Try company suffix boundary first
  const suffixMatch = text.match(
    /^(.+?(?:LLC|L\.L\.C\.?|L\s+L\s+C|LIMITED|LTD|TRADING|ENTERPRISE\w*|FZCO|FZE|CORP\.?|INC\.?|GROUP|WHOLESALER\w*|COMPANY|CO\.))\s*(.*)/i
  );
  if (suffixMatch) {
    const counterparty = cleanText(suffixMatch[1]);
    const geo = suffixMatch[2].trim();
    return { counterparty, country: tidyGeography(geo) };
  }

  // Fallback: strip trailing 2-letter CC, then known geography words
  const words = text.split(/\s+/);
  const lastWord = words[words.length - 1];
  let geoStart = words.length;

  // Walk back through known geographic tokens (all-caps short words, country names)
  for (let i = words.length - 1; i >= 1; i--) {
    const w = words[i];
    if (/^[A-Z]{2}$/.test(w) || GEO_WORDS.has(w.toUpperCase())) {
      geoStart = i;
    } else {
      break;
    }
  }

  const counterparty = cleanText(words.slice(0, geoStart).join(' '));
  const geoRaw = words.slice(geoStart).join(' ');
  return { counterparty: counterparty || text, country: tidyGeography(geoRaw) };
}

const GEO_WORDS = new Set([
  'UNITED', 'STATES', 'KINGDOM', 'AMERICA', 'INDIA', 'CHINA', 'PAKISTAN', 'UK', 'USA', 'UAE',
  'LONDON', 'MUMBAI', 'DELHI', 'DUBAI', 'SINGAPORE', 'HONG', 'KONG', 'FRANCE', 'GERMANY',
  'JAPAN', 'KOREA', 'TURKEY', 'EGYPT', 'JORDAN', 'SAUDI', 'ARABIA', 'KINGDO', 'EMIRATE',
  'EMIRATES', 'BANGLADESH', 'SRI', 'LANKA',
]);

function tidyGeography(geo: string): string | null {
  if (!geo) return null;
  const cleaned = geo
    .replace(/\b[A-Z]{2}\b/g, '')
    .replace(/\b(mum|del|hkg|sgp|bom|lhr|dxb)\b/gi, '')
    .replace(/UNITED\s+KINGDO\b/gi, 'United Kingdom')
    .replace(/UNITED\s+KINGDOM/gi, 'United Kingdom')
    .replace(/UNITED\s+STATES\s+OF\s+AMERICA/gi, 'United States')
    .replace(/UNITED\s+ARAB\s+EMIRATES?/gi, 'UAE')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || null;
}

function extractCounterpartyAfterBankId(text: string): string | null {
  // After stripping the prefix, take everything up to a known purpose code or currency
  const m = text.match(/^(.+?(?:LLC|L\.L\.C\.?|LIMITED|LTD|FZCO|FZE|TRADING|GROUP))/i);
  return m ? cleanText(m[1]) : cleanText(text.split(/\s+/).slice(0, 4).join(' ')) || null;
}

// Strip payment purpose clauses from sender string
// e.g. "COMIDA GOODS WHOLE SALERS LLC BANK S /REF/OTHERS PAYMENT AGAINST INV"
function stripPaymentPurpose(raw: string): string {
  return cleanText(
    raw
      .replace(/\s+BANK\s+\S+.*$/i, '')        // BANK S /REF/...
      .replace(/\s+\/REF\/.*$/i, '')             // /REF/...
      .replace(/\s+PAYMENT\s+AGAINST.*$/i, '')   // PAYMENT AGAINST INV
      .replace(/\s+PO\s+BOX.*$/i, '')            // PO BOX ...
      .replace(/\s+Others\b.*$/i, '')               // IPP "Others" purpose code suffix
      .replace(/\b(LLC|L\.L\.C\.?|L\s+L\s+C|LIMITED|LTD|FZCO|FZE)\b.*$/i, '$1') // strip junk after company suffix
      .replace(/\s+[\d][\d\s-]{3,}$/, '')          // trailing reference numbers (4+ chars)
  ) || raw;
}
