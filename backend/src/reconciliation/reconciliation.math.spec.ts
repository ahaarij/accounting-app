/**
 * Unit tests for reconciliation math — no DB required.
 * Tests the pure arithmetic used in Check 1 and Check 5.
 */

// ── Check 1: Balance Reconciliation ──────────────────────────────────────────

function calcExpectedClosing(
  openingBalance: number,
  totalDeposits: number,
  totalWithdrawals: number,
): number {
  return openingBalance + totalDeposits - totalWithdrawals;
}

function deriveOpening(firstRunning: number, firstDeposit: number, firstWithdrawal: number): number {
  return firstRunning - firstDeposit + firstWithdrawal;
}

function isBalanced(expected: number, actual: number, tolerance = 0.01): boolean {
  return parseFloat(Math.abs(expected - actual).toFixed(10)) <= tolerance;
}

describe('Check 1 — Balance Reconciliation', () => {
  it('matches when opening + deposits - withdrawals equals closing', () => {
    expect(isBalanced(calcExpectedClosing(1000, 500, 200), 1300)).toBe(true);
  });

  it('flags discrepancy when difference exceeds tolerance', () => {
    expect(isBalanced(calcExpectedClosing(1000, 500, 200), 1301)).toBe(false);
  });

  it('allows rounding difference within ±0.01', () => {
    expect(isBalanced(calcExpectedClosing(1000.005, 0, 0), 1000.01)).toBe(true);
  });

  it('treats exactly 0.01 difference as balanced', () => {
    expect(isBalanced(100, 100.01)).toBe(true);
  });

  it('treats 0.011 difference as discrepancy', () => {
    expect(isBalanced(100, 100.011)).toBe(false);
  });

  it('derives opening balance correctly from first transaction', () => {
    // first tx: running=6692.5, deposit=10000, withdrawal=0 → opening = 6692.5 - 10000 + 0 = -3307.5
    expect(deriveOpening(6692.5, 10000, 0)).toBeCloseTo(-3307.5);
  });

  it('derives opening balance correctly when first tx is withdrawal', () => {
    // first tx: running=2000, deposit=0, withdrawal=500 → opening = 2000 - 0 + 500 = 2500
    expect(deriveOpening(2000, 0, 500)).toBeCloseTo(2500);
  });

  it('handles zero opening balance', () => {
    expect(isBalanced(calcExpectedClosing(0, 1000, 1000), 0)).toBe(true);
  });

  it('handles negative closing balance', () => {
    expect(isBalanced(calcExpectedClosing(100, 0, 500), -400)).toBe(true);
  });
});

// ── Check 5: Counterparty Balance Validation ─────────────────────────────────

function calcExpectedCounterpartyClosing(
  openingAed: number,
  inward: number,
  outward: number,
  commission: number,
): number {
  return openingAed + inward - outward + commission;
}

describe('Check 5 — Counterparty Balance Validation', () => {
  it('validates a balanced counterparty row', () => {
    const expected = calcExpectedCounterpartyClosing(1000, 500, 300, 50);
    expect(isBalanced(expected, 1250)).toBe(true);
  });

  it('flags an unbalanced counterparty row', () => {
    const expected = calcExpectedCounterpartyClosing(1000, 500, 300, 50);
    expect(isBalanced(expected, 1100)).toBe(false);
  });

  it('handles null fields treated as zero', () => {
    const inward: number | null = null;
    const outward: number | null = null;
    const commission: number | null = null;
    const expected = calcExpectedCounterpartyClosing(-537611.27, inward ?? 0, outward ?? 0, commission ?? 0);
    expect(isBalanced(expected, -537611.27)).toBe(true);
  });

  it('validates negative opening balance with inward fund applied', () => {
    // ob=-537611.27, inward=182533.05, outward=0, commission=0 → expected=-355078.22
    const expected = calcExpectedCounterpartyClosing(-537611.27, 182533.05, 0, 0);
    expect(isBalanced(expected, -355078.22, 0.01)).toBe(true);
  });

  it('allows ±0.01 rounding tolerance', () => {
    const expected = calcExpectedCounterpartyClosing(100.005, 0, 0, 0);
    expect(isBalanced(expected, 100.01)).toBe(true);
  });
});

// ── date normalisation (pure logic, no imports needed) ───────────────────────

function normalizeDateStr(s: string): string | null {
  if (!s) return null;
  const dmy = s.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return s.substring(0, 10);
  return null;
}

describe('Date normalisation', () => {
  it('parses DD.MM.YYYY', () => expect(normalizeDateStr('03.09.2025')).toBe('2025-09-03'));
  it('parses DD-MM-YYYY', () => expect(normalizeDateStr('03-09-2025')).toBe('2025-09-03'));
  it('parses DD/MM/YYYY', () => expect(normalizeDateStr('03/09/2025')).toBe('2025-09-03'));
  it('parses single-digit day/month', () => expect(normalizeDateStr('5-5-2026')).toBe('2026-05-05'));
  it('passes through ISO format', () => expect(normalizeDateStr('2026-05-07')).toBe('2026-05-07'));
  it('returns null for empty string', () => expect(normalizeDateStr('')).toBeNull());
});
