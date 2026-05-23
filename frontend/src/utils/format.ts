const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Formats any date value (ISO string, Date object, YYYY-MM-DD) as "3 May 2026" */
export function fmtDate(d: any): string {
  if (!d) return '—';
  const s = typeof d === 'string' ? d : (d instanceof Date ? d.toISOString() : String(d));
  if (!s) return '—';

  // Pure YYYY-MM-DD — parse components directly, no timezone involved
  const pure = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (pure) {
    const [, y, m, day] = pure;
    return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${parseInt(y)}`;
  }

  // ISO datetime string — use local Date methods so the user's timezone is applied,
  // e.g. "2025-12-05T20:00:00.000Z" in UTC+4 correctly renders as 6 Dec 2025
  const dt = new Date(s);
  if (isNaN(dt.getTime())) return s.slice(0, 10);
  return `${dt.getDate()} ${MONTHS[dt.getMonth()]} ${dt.getFullYear()}`;
}
