import { useState, useEffect, useMemo } from 'react';
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react';
import { Layout } from '../components/Layout';
import { getExcelTransactionsByDate } from '../api';
import { cn } from '../lib/utils';

// ── Types ──────────────────────────────────────────────────────────────────────

interface DayTx {
  id: number;
  date: string;
  particular: string | null;
  deposit: number | null;
  withdrawal: number | null;
  balance: number | null;
  transaction_type: string | null;
  custom_label: string | null;
  account_id: number;
  company_name: string;
  bank_name: string | null;
  currency: string | null;
  import_group: string | null;
  account_code: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftDay(date: string, delta: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + delta);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function fmtDateLabel(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-AE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function fmt(n: number | null): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

const TYPE_LABEL: Record<string, { label: string; cls: string }> = {
  INWARD_TRANSFER:   { label: 'Inward',   cls: 'bg-emerald-50 text-emerald-700' },
  OUTWARD_TRANSFER:  { label: 'Outward',  cls: 'bg-red-50 text-red-600' },
  INTERNAL_TRANSFER: { label: 'Internal', cls: 'bg-blue-50 text-blue-600' },
  FX_CONVERSION:     { label: 'FX',       cls: 'bg-purple-50 text-purple-600' },
  BANK_CHARGE:       { label: 'Charge',   cls: 'bg-gray-100 text-gray-500' },
  VAT_CHARGE:        { label: 'VAT',      cls: 'bg-gray-100 text-gray-500' },
  CASH_DEPOSIT:      { label: 'Cash',     cls: 'bg-amber-50 text-amber-700' },
  CHEQUE_PAID:       { label: 'Cheque',   cls: 'bg-amber-50 text-amber-700' },
  SUSPENSE:          { label: 'Suspense', cls: 'bg-orange-50 text-orange-600' },
};

function TypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  const t = TYPE_LABEL[type] ?? { label: type, cls: 'bg-gray-100 text-gray-500' };
  return (
    <span className={cn('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide', t.cls)}>
      {t.label}
    </span>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function DailyTransactions() {
  const [date, setDate] = useState(todayStr());
  const [rows, setRows] = useState<DayTx[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    getExcelTransactionsByDate(date)
      .then((r) => setRows(r.data))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [date]);

  // Group by company_name + bank_name + currency (account identity)
  const grouped = useMemo(() => {
    const map = new Map<string, { key: string; company_name: string; bank_name: string | null; currency: string | null; import_group: string | null; txs: DayTx[] }>();
    for (const tx of rows) {
      const key = `${tx.account_id}`;
      if (!map.has(key)) {
        map.set(key, { key, company_name: tx.company_name, bank_name: tx.bank_name, currency: tx.currency, import_group: tx.import_group, txs: [] });
      }
      map.get(key)!.txs.push(tx);
    }
    return Array.from(map.values());
  }, [rows]);

  const stats = useMemo(() => {
    const totalDeposits = rows.reduce((s, r) => s + (parseFloat(String(r.deposit ?? 0)) || 0), 0);
    const totalWithdrawals = rows.reduce((s, r) => s + (parseFloat(String(r.withdrawal ?? 0)) || 0), 0);
    return {
      companies: new Set(rows.map((r) => r.account_id)).size,
      txCount: rows.length,
      totalDeposits,
      totalWithdrawals,
      net: totalDeposits - totalWithdrawals,
    };
  }, [rows]);

  const isToday = date === todayStr();

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <div className="px-8 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Daily View</h1>
              <p className="text-sm text-gray-400 mt-0.5">All transactions from Excel data for a single day</p>
            </div>
          </div>

          {/* Date navigator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl shadow-sm px-2 py-1.5">
              <button onClick={() => setDate((d) => shiftDay(d, -1))}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors">
                <ChevronLeft size={15} />
              </button>
              <div className="flex items-center gap-2 px-2">
                <CalendarDays size={14} className="text-gray-400" />
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && setDate(e.target.value)}
                  className="text-sm font-semibold text-gray-800 border-none outline-none bg-transparent cursor-pointer"
                />
              </div>
              <button onClick={() => setDate((d) => shiftDay(d, 1))}
                disabled={isToday}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:cursor-default">
                <ChevronRight size={15} />
              </button>
            </div>
            {!isToday && (
              <button onClick={() => setDate(todayStr())}
                className="px-3 py-2 text-xs font-semibold text-blue-600 border border-blue-200 bg-white rounded-xl hover:bg-blue-50 transition-colors shadow-sm">
                Today
              </button>
            )}
            <span className="text-sm text-gray-400">{fmtDateLabel(date)}</span>
          </div>

          {/* Stats */}
          {!loading && rows.length > 0 && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Accounts Active</p>
                <p className="text-2xl font-bold text-gray-900 font-mono mt-2">{stats.companies}</p>
                <p className="text-xs text-gray-400 mt-0.5">{stats.txCount} transaction{stats.txCount !== 1 ? 's' : ''}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Deposits</p>
                <p className="text-2xl font-bold text-emerald-600 font-mono mt-2">{fmt(stats.totalDeposits)}</p>
                <p className="text-xs text-gray-400 mt-0.5">AED</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Withdrawals</p>
                <p className="text-2xl font-bold text-red-500 font-mono mt-2">{fmt(stats.totalWithdrawals)}</p>
                <p className="text-xs text-gray-400 mt-0.5">AED</p>
              </div>
              <div className={cn('rounded-xl border px-5 py-4 shadow-sm', stats.net >= 0 ? 'bg-white border-gray-100' : 'bg-red-50 border-red-100')}>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Net</p>
                <p className={cn('text-2xl font-bold font-mono mt-2', stats.net >= 0 ? 'text-gray-900' : 'text-red-600')}>{fmt(stats.net)}</p>
                <p className="text-xs text-gray-400 mt-0.5">deposits − withdrawals</p>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm overflow-hidden">
            {loading ? (
              <div className="py-20 text-center">
                <div className="inline-flex gap-1.5">
                  {[0, 100, 200].map((d) => (
                    <div key={d} className="w-2 h-2 bg-blue-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
                  ))}
                </div>
              </div>
            ) : rows.length === 0 ? (
              <div className="py-24 text-center">
                <CalendarDays size={28} className="text-gray-200 mx-auto mb-3" />
                <p className="text-sm text-gray-400">No transactions recorded for {fmtDateLabel(date)}</p>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-gray-100 bg-gray-50/60">
                  <tr>
                    <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Company</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">Bank</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-16">Ccy</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Particular</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-24">Type</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-36">Deposit</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-36">Withdrawal</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider w-36">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map((group) =>
                    group.txs.map((tx, ti) => (
                      <tr key={tx.id}
                        className={cn(
                          'border-b border-gray-50 last:border-0 transition-colors hover:bg-gray-50/40',
                          ti === 0 && 'border-t border-gray-100',
                        )}>
                        {/* Company only on first row of each group */}
                        {ti === 0 ? (
                          <td className="px-5 py-3 align-top" rowSpan={group.txs.length}>
                            <div className="font-semibold text-gray-800 text-xs leading-tight">{group.company_name}</div>
                            {group.import_group && (
                              <span className="text-[10px] text-gray-300 font-mono">Grp {group.import_group}</span>
                            )}
                          </td>
                        ) : null}
                        {ti === 0 ? (
                          <td className="px-4 py-3 align-top text-xs text-gray-500 font-mono w-24" rowSpan={group.txs.length}>
                            {group.bank_name ?? '—'}
                          </td>
                        ) : null}
                        {ti === 0 ? (
                          <td className="px-4 py-3 align-top text-xs text-gray-400 w-16" rowSpan={group.txs.length}>
                            {group.currency ?? '—'}
                          </td>
                        ) : null}
                        <td className="px-4 py-3 text-xs text-gray-700 max-w-xs">
                          <span className="line-clamp-2">{tx.custom_label ?? tx.particular ?? '—'}</span>
                        </td>
                        <td className="px-4 py-3 w-24">
                          <TypeBadge type={tx.transaction_type} />
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums font-mono w-36">
                          {tx.deposit != null && parseFloat(String(tx.deposit)) > 0
                            ? <span className="text-emerald-600 font-semibold">{fmt(parseFloat(String(tx.deposit)))}</span>
                            : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums font-mono w-36">
                          {tx.withdrawal != null && parseFloat(String(tx.withdrawal)) > 0
                            ? <span className="text-red-500 font-semibold">{fmt(parseFloat(String(tx.withdrawal)))}</span>
                            : <span className="text-gray-200">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-xs tabular-nums font-mono font-bold text-gray-700 w-36">
                          {tx.balance != null ? fmt(parseFloat(String(tx.balance))) : <span className="text-gray-200">—</span>}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                <tfoot className="border-t border-gray-100 bg-gray-50/60">
                  <tr>
                    <td colSpan={5} className="px-5 py-3 text-xs text-gray-400">
                      {stats.txCount} transaction{stats.txCount !== 1 ? 's' : ''} across {stats.companies} account{stats.companies !== 1 ? 's' : ''}
                    </td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-emerald-600 tabular-nums font-mono">{fmt(stats.totalDeposits)}</td>
                    <td className="px-4 py-3 text-right text-xs font-bold text-red-500 tabular-nums font-mono">{fmt(stats.totalWithdrawals)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
