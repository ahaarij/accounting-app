export type BankCode = 'ADIB' | 'FAB' | 'FAB_NEW' | 'WIO' | 'ENBD' | 'EIB' | 'NBF' | 'MASHREQ' | 'UBL' | 'ADCB' | 'RAKBANK';

export function detectBank(text: string): BankCode | null {
  // NBF must come before ENBD — NBF transactions reference EBILAEAD as a beneficiary
  // SWIFT code in narrations (e.g. "SW-EBILAEAD"), which would otherwise false-match ENBD
  if (/Transaction History/i.test(text) && /IBAN Number:/i.test(text)) return 'NBF';
  // ENBD uses EBILAEADXXX (full BIC) in its own header
  if (text.includes('EBILAEADXXX') && !text.includes('Islamic Account Statement') && !text.includes('MEBLAEADXXX')) return 'ENBD';
  if (text.includes('Islamic Account Statement') || text.includes('MEBLAEADXXX')) return 'EIB';
  if (text.includes('Abu Dhabi Islamic Bank')) return 'ADIB';
  if (text.includes('600 500 946') || text.includes('600500946')) return 'WIO';
  // ADCB: unique "Report Date:" + "Account No. :" header combo
  if (/Report Date:/.test(text) && /Account No\.\s*:/.test(text) && /Opening Balance:/i.test(text)) return 'ADCB';
  // UBL (United Bank Limited): BRANCH:/ACCOUNT NO:/IBAN NO: label-then-value format
  if (/^BRANCH:\s*$/m.test(text) && /IBAN NO:/i.test(text)) return 'UBL';
  // Mashreq: "Mashreq Online" footer on system-generated statements
  if (/Account Statement/i.test(text) && /Mashreq Online/i.test(text)) return 'MASHREQ';
  // RAKBANK (National Bank of Ras Al Khaimah)
  if (/RAKBANK/i.test(text) || /National Bank of Ras Al Khaimah/i.test(text)) return 'RAKBANK';
  // FAB_NEW: "Report generated on" + "FAB UAE" in header (new online banking export format)
  if (/Report generated on/i.test(text) && /FAB UAE/i.test(text)) return 'FAB_NEW';
  if (/Company Name:/i.test(text) && (/FT\d{5}[A-Z0-9]+/.test(text) || /ST10/.test(text))) return 'FAB';
  return null;
}
