// Normalised form of a statement description used to match suspense rules —
// whitespace collapsed, trimmed, case-insensitive. Keep in sync with the SQL
// equivalent: UPPER(BTRIM(regexp_replace(COALESCE(col,''), '\s+', ' ', 'g')))
export function normalizeDescription(s: string | null | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
}
