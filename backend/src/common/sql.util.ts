// Escape LIKE/ILIKE wildcards in user-supplied search strings so "%" or "_"
// in a search box matches literally instead of acting as a wildcard.
export function escapeLike(input: string): string {
  return (input ?? '').replace(/[\\%_]/g, (m) => '\\' + m);
}
