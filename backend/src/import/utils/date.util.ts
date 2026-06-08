// Centralised date normalisation — handles all formats seen in client files

export function normalizeDate(raw: any): string | null {
  if (raw == null || raw === '') return null;

  // Excel serial number (number type)
  if (typeof raw === 'number') {
    const date = excelSerialToDate(raw);
    if (date) return formatDate(date);
    return null;
  }

  const s = String(raw).trim();
  if (!s) return null;

  // Numeric string that looks like an Excel serial (e.g. "45781")
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    const date = excelSerialToDate(n);
    if (date) return formatDate(date);
    return null;
  }

  // Already ISO
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const iso = s.substring(0, 10);
    return isValidCalendarDate(iso) ? iso : null;
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY
  const dmy = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    return isValidCalendarDate(iso) ? iso : null;
  }

  // MM/DD/YYYY
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) {
    const [, m, d, y] = mdy;
    const iso = `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    return isValidCalendarDate(iso) ? iso : null;
  }

  // DD MMM YYYY or DD-MMM-YY
  const dmonY = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3})[-\s](\d{2,4})/);
  if (dmonY) {
    const [, d, mon, y] = dmonY;
    const months: Record<string,string> = {jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'};
    const m = months[mon.toLowerCase()];
    if (m) {
      const year = y.length === 2 ? `20${y}` : y;
      const iso = `${year}-${m}-${d.padStart(2,'0')}`;
      return isValidCalendarDate(iso) ? iso : null;
    }
  }

  // Try JS Date as fallback
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return formatDate(dt);

  return null;
}

/** Validate that the calendar date actually exists (e.g. rejects 2025-09-31) */
function isValidCalendarDate(iso: string): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  // Use Date to check — set UTC to avoid TZ shifts
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() + 1 === m && dt.getUTCDate() === d;
}

function excelSerialToDate(serial: number): Date | null {
  if (serial < 1 || serial > 2958465) return null;
  const utc_days = Math.floor(serial - 25569);
  const utc_value = utc_days * 86400;
  return new Date(utc_value * 1000);
}

function formatDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function toNumber(val: any): number | null {
  if (val == null || val === '') return null;
  if (typeof val === 'string' && val.trim() === '-') return null;
  // Strip whitespace and commas
  const cleaned = String(val).replace(/,/g, '').trim();
  if (cleaned === '' || cleaned === '-' || cleaned === '--') return null;
  // Accounting bracket notation: (154486.38) means -154486.38
  const bracketMatch = cleaned.match(/^\((.+)\)$/);
  if (bracketMatch) {
    const n = parseFloat(bracketMatch[1]);
    return isNaN(n) ? null : -n;
  }
  const n = typeof val === 'number' ? val : parseFloat(cleaned);
  return isNaN(n) ? null : n;
}
