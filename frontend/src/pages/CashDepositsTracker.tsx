import { Fragment, useState, useEffect, useMemo } from 'react';
import { Layout } from '../components/Layout';
import {
  ChevronDown, ChevronRight, ChevronUp,
  Plus, Pencil, Trash2, AlertTriangle, SlidersHorizontal, Calculator, Check,
} from 'lucide-react';
import { cn } from '../lib/utils';
import {
  fetchCashDeposits, createCashDeposit, updateCashDeposit,
  deleteCashDeposit, updateCompanyDepositLimits,
} from '../api/cashDeposits';
import { useAuth } from '../auth/AuthContext';

// ── Types ──────────────────────────────────────────────────────────────────────

interface Deposit {
  id: number;
  date: string;
  description: string | null;
  amount: number;
  currency: string;
  running_total: number;
}

interface CompanyRow {
  company_id: number;
  bank_account: string | null;
  category: string | null;
  company_name: string;
  owner_name: string | null;
  total_deposits: number;
  deposits: Deposit[];
  per_tx_limit: number;
  monthly_limit: number;
}

type ViewMode = 'category' | 'bank' | 'owner' | 'company';
type SortKey = 'category' | 'company_name' | 'bank_account' | 'total_deposits';
type SortDir = 'asc' | 'desc';

const VIEW_TABS: { mode: ViewMode; label: string }[] = [
  { mode: 'category', label: 'Category' },
  { mode: 'bank',     label: 'By Bank'  },
  { mode: 'owner',    label: 'By Owner' },
  { mode: 'company',  label: 'By Brand' },
];

// ── Pure helpers ───────────────────────────────────────────────────────────────

function rowKey(c: CompanyRow): string {
  return `${c.company_id}:${c.bank_account ?? '__none__'}`;
}

function getBankName(bankAccount: string | null): string {
  if (!bankAccount) return 'No Account';
  // "DIB-1234" or "DIB 1234" → "DIB"
  const m = bankAccount.match(/^([A-Z]{2,})/);
  return m ? m[1] : bankAccount.split(/[\s\-_]/)[0].toUpperCase() || 'Unknown';
}

function getEffectiveDates(mode: 'current_month' | 'custom', from: string, to: string) {
  if (mode === 'current_month') {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${d}` };
  }
  return { from, to };
}

const CORP_DESIGNATORS = new Set([
  'LLC', 'FZE', 'FZCO', 'FZC', 'LTD', 'LIMITED', 'LLC-FZ', 'FZ', 'CO',
]);

const BUSINESS_WORDS = new Set([
  'GENERAL', 'TRADING', 'TECHNOLOGY', 'TECHNOLOGIES', 'REAL', 'ESTATE',
  'INTERNATIONAL', 'EXIM', 'SHIPPING', 'LOGISTICS', 'EVENTS', 'MANAGEMENT',
  'INFORMATION', 'IT', 'SOLUTIONS', 'SOLUTION', 'GROUPS', 'GROUP', 'GOODS',
  'WHOLESALERS', 'WHOLESALER', 'BULLIONS', 'BULLION', 'TOURISM', 'RECYCLING',
  'HOLDING', 'COMMERCIAL', 'BROKERS', 'BROKER', 'FORFAITING', 'VENTURES',
  'VENTURE', 'PROJECT', 'SERVICES', 'SERVICE', 'MANUFACTURING', 'MARKETING',
  'MULTY', 'MULTI', 'INT', 'PAPER', 'PLASTIC', 'PLUS', 'RWA',
]);

function getCoreCompanyName(name: string): string {
  let n = name.replace(/L\.L\.C/gi, 'LLC');
  n = n.replace(/\(.*?\)/g, '').trim();
  n = n.replace(/-\s*$/, '').trim();
  n = n.split(/\s+-\s+/)[0].trim();
  const words = n.toUpperCase().split(/[\s.&,/+]+/).filter((w) => w.length > 0);
  while (words.length > 1 && CORP_DESIGNATORS.has(words[words.length - 1])) words.pop();
  while (words.length > 1 && BUSINESS_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}

function sortRows(rows: CompanyRow[], key: SortKey, dir: SortDir): CompanyRow[] {
  return [...rows].sort((a, b) => {
    let cmp = 0;
    if (key === 'category') cmp = (a.category || 'Z').localeCompare(b.category || 'Z');
    else if (key === 'company_name') cmp = a.company_name.localeCompare(b.company_name);
    else if (key === 'bank_account') cmp = (a.bank_account || '').localeCompare(b.bank_account || '');
    else cmp = a.total_deposits - b.total_deposits;
    if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    cmp = a.company_name.localeCompare(b.company_name);
    if (cmp !== 0) return cmp;
    return (a.bank_account || '').localeCompare(b.bank_account || '');
  });
}

function getLimitStatus(row: CompanyRow): 'exceeded' | 'warning' | 'ok' {
  const { total_deposits, monthly_limit } = row;
  if (total_deposits >= monthly_limit) return 'exceeded';
  if (total_deposits >= monthly_limit * 0.8) return 'warning';
  return 'ok';
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function CategoryBadge({ cat }: { cat: string | null }) {
  if (!cat) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <span className={cn('px-2 py-0.5 text-xs font-semibold rounded',
      cat === 'A' ? 'bg-amber-100 text-amber-700' :
      cat === 'B' ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-700')}>
      {cat}
    </span>
  );
}

// ── Deposit planner ────────────────────────────────────────────────────────────

interface PlanAllocation {
  company_id: number;
  company_name: string;
  bank_account: string;
  category: string | null;
  amount: number;
  remaining_after: number;
}

function buildDepositPlan(
  total: number,
  rows: CompanyRow[],
): { allocations: PlanAllocation[]; leftover: number } {
  const CAT_ORDER: Record<string, number> = { C: 0, B: 1, A: 2 };

  type Slot = { row: CompanyRow; available: number; used: number };

  const slots: Slot[] = rows
    .filter((r) => r.bank_account !== null && r.monthly_limit - r.total_deposits > 0.01)
    .map((r) => ({ row: r, available: r.monthly_limit - r.total_deposits, used: 0 }))
    .sort((a, b) => {
      const aO = CAT_ORDER[a.row.category ?? ''] ?? 3;
      const bO = CAT_ORDER[b.row.category ?? ''] ?? 3;
      if (aO !== bO) return aO - bO;
      return a.row.total_deposits - b.row.total_deposits; // least used first
    });

  const allocations: PlanAllocation[] = [];
  let remaining = total;
  let progress = true;

  // Round-robin: one per_tx_limit chunk per slot per pass
  while (remaining > 0.01 && progress) {
    progress = false;
    for (const slot of slots) {
      if (remaining <= 0.01) break;
      const room = parseFloat((slot.available - slot.used).toFixed(2));
      if (room <= 0.01) continue;
      const chunk = parseFloat(Math.min(slot.row.per_tx_limit, room, remaining).toFixed(2));
      if (chunk <= 0) continue;
      allocations.push({
        company_id: slot.row.company_id,
        company_name: slot.row.company_name,
        bank_account: slot.row.bank_account!,
        category: slot.row.category,
        amount: chunk,
        remaining_after: parseFloat((room - chunk).toFixed(2)),
      });
      slot.used = parseFloat((slot.used + chunk).toFixed(2));
      remaining = parseFloat((remaining - chunk).toFixed(2));
      progress = true;
    }
  }

  return { allocations, leftover: remaining > 0.01 ? remaining : 0 };
}

function byName<T extends { total_deposits: number }>(
  rows: CompanyRow[],
  keyFn: (r: CompanyRow) => string,
  labelFn: (key: string, members: CompanyRow[]) => { label: string; subtitle?: string },
): { key: string; label: string; subtitle?: string; rows: CompanyRow[]; total_deposits: number }[] {
  const map = new Map<string, CompanyRow[]>();
  for (const r of rows) {
    const k = keyFn(r);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(r);
  }
  return Array.from(map.entries())
    .map(([k, members]) => ({
      key: k,
      ...labelFn(k, members),
      rows: [...members].sort(
        (a, b) => a.company_name.localeCompare(b.company_name) || (a.bank_account || '').localeCompare(b.bank_account || ''),
      ),
      total_deposits: members.reduce((s, r) => s + r.total_deposits, 0),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

// ── SortHeader ─────────────────────────────────────────────────────────────────

function SortHeader({ label, col, current, dir, onSort, className }: {
  label: string; col: SortKey; current: SortKey; dir: SortDir;
  onSort: (k: SortKey) => void; className?: string;
}) {
  const active = current === col;
  return (
    <th
      onClick={() => onSort(col)}
      className={cn('px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none whitespace-nowrap', className)}
    >
      <div className="flex items-center gap-1">
        {label}
        <span className="flex flex-col leading-none">
          <ChevronUp size={10} className={active && dir === 'asc' ? 'text-blue-600' : 'text-gray-300'} />
          <ChevronDown size={10} className={active && dir === 'desc' ? 'text-blue-600' : 'text-gray-300'} />
        </span>
      </div>
    </th>
  );
}

// ── Deposit modal ──────────────────────────────────────────────────────────────

function DepositModal({ company, deposit, onClose, onSave }: {
  company: CompanyRow;
  deposit: Deposit | null;
  onClose: () => void;
  onSave: (dto: { date: string; description: string; amount: number }) => Promise<void>;
}) {
  const [date, setDate] = useState(deposit?.date ?? todayStr());
  const [description, setDescription] = useState(deposit?.description ?? '');
  const [amount, setAmount] = useState(deposit ? String(deposit.amount) : '');
  const [saving, setSaving] = useState(false);

  const amountNum = parseFloat(amount) || 0;
  const overTxLimit = amountNum > 0 && amountNum > company.per_tx_limit;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim() || !amount || amountNum <= 0) return;
    setSaving(true);
    try { await onSave({ date, description: description.trim(), amount: amountNum }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-[400px]">
        <h2 className="text-base font-semibold text-gray-900 mb-0.5">
          {deposit ? 'Edit Deposit' : 'Add Deposit'}
        </h2>
        <div className="mb-5">
          <p className="text-xs text-gray-500 font-medium">{company.company_name}</p>
          {company.bank_account && (
            <p className="text-xs text-gray-400 mt-0.5">{company.bank_account}</p>
          )}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)} required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Description</label>
            <input
              type="text" value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Enter description" required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Amount (AED)</label>
            <input
              type="number" value={amount} onChange={(e) => setAmount(e.target.value)}
              min="0.01" step="0.01" required placeholder="0.00"
              className={cn('w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2',
                overTxLimit ? 'border-amber-400 focus:ring-amber-400' : 'border-gray-300 focus:ring-blue-500')}
            />
            {overTxLimit && (
              <div className="flex items-center gap-1.5 mt-1.5 px-2.5 py-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle size={12} />
                Exceeds per-transaction limit of AED {fmt(company.per_tx_limit)}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : deposit ? 'Update' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Company limits modal ───────────────────────────────────────────────────────

function CompanyLimitsModal({ company, onClose, onSave }: {
  company: CompanyRow;
  onClose: () => void;
  onSave: (dto: { per_tx_limit: number; monthly_limit: number }) => Promise<void>;
}) {
  const [perTx, setPerTx] = useState(String(company.per_tx_limit));
  const [monthly, setMonthly] = useState(String(company.monthly_limit));
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ per_tx_limit: parseFloat(perTx), monthly_limit: parseFloat(monthly) }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl p-6 w-[380px]">
        <h2 className="text-base font-semibold text-gray-900 mb-0.5">Deposit Limits</h2>
        <div className="mb-5">
          <p className="text-xs text-gray-500 font-medium">{company.company_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">Applies to all accounts for this company</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Per Transaction Limit (AED)</label>
            <input
              type="number" value={perTx} onChange={(e) => setPerTx(e.target.value)}
              min="1" step="1" required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monthly Limit (AED)</label>
            <input
              type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)}
              min="1" step="1" required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Deposit planner modal ──────────────────────────────────────────────────────

function DepositPlannerModal({ rows, onClose, onDepositsAdded }: {
  rows: CompanyRow[];
  onClose: () => void;
  onDepositsAdded: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [plan, setPlan] = useState<PlanAllocation[] | null>(null);
  const [leftover, setLeftover] = useState(0);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<Set<number>>(new Set());
  const [addingAll, setAddingAll] = useState(false);

  function calculate() {
    const n = parseFloat(amount.replace(/,/g, ''));
    if (!n || n <= 0) return;
    const result = buildDepositPlan(n, rows);
    setPlan(result.allocations);
    setLeftover(result.leftover);
    setAdded(new Set());
  }

  async function addOne(i: number, alloc: PlanAllocation) {
    setSaving((prev) => new Set(prev).add(i));
    try {
      await createCashDeposit({
        company_id: alloc.company_id,
        bank_account: alloc.bank_account,
        date: todayStr(),
        description: description.trim() || 'Large deposit',
        amount: alloc.amount,
      });
      setAdded((prev) => new Set(prev).add(i));
      onDepositsAdded();
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(i); return s; });
    }
  }

  async function addAll() {
    if (!plan) return;
    setAddingAll(true);
    try {
      for (let i = 0; i < plan.length; i++) {
        if (added.has(i)) continue;
        await createCashDeposit({
          company_id: plan[i].company_id,
          bank_account: plan[i].bank_account,
          date: todayStr(),
          description: description.trim() || 'Large deposit',
          amount: plan[i].amount,
        });
        setAdded((prev) => new Set(prev).add(i));
        onDepositsAdded();
      }
    } finally {
      setAddingAll(false);
    }
  }

  const allocatedTotal = plan ? plan.reduce((s, a) => s + a.amount, 0) : 0;
  const uniqueAccounts = plan ? new Set(plan.map((a) => `${a.company_id}::${a.bank_account}`)).size : 0;
  const allAdded = plan !== null && plan.length > 0 && added.size === plan.length;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-xl w-[700px] max-h-[85vh] flex flex-col">
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Large Deposit Planner</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Splits an amount across accounts — Category C first, then least-used accounts
          </p>
        </div>

        <div className="px-6 py-4 border-b border-gray-100 space-y-3">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-700 mb-1">Total Amount to Deposit (AED)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => { setAmount(e.target.value); setPlan(null); setAdded(new Set()); }}
                onKeyDown={(e) => e.key === 'Enter' && calculate()}
                placeholder="e.g. 2000000"
                min="1"
                autoFocus
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={calculate}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Find Split
            </button>
          </div>
          {plan && plan.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Description (applied to all)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Cash deposit Jun 2026"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          )}
        </div>

        <div className="overflow-y-auto flex-1">
          {plan === null ? (
            <div className="py-16 text-center text-sm text-gray-400">Enter an amount and click Find Split</div>
          ) : plan.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No accounts have remaining capacity this month</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200 sticky top-0">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-8">#</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-12">Cat</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Company</th>
                  <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Account</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Deposit (AED)</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Remaining After</th>
                  <th className="w-20 px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {plan.map((a, i) => {
                  const isAdded = added.has(i);
                  const isSaving = saving.has(i);
                  return (
                    <tr key={i} className={cn('border-b border-gray-100 last:border-0', isAdded ? 'bg-green-50' : 'hover:bg-gray-50/60')}>
                      <td className="px-4 py-2.5 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                      <td className="px-4 py-2.5"><CategoryBadge cat={a.category} /></td>
                      <td className="px-4 py-2.5 text-gray-800 font-medium text-xs">{a.company_name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{a.bank_account}</td>
                      <td className="px-4 py-2.5 text-right text-xs font-semibold text-gray-800 tabular-nums">{fmt(a.amount)}</td>
                      <td className="px-4 py-2.5 text-right text-xs tabular-nums text-gray-400">{fmt(a.remaining_after)}</td>
                      <td className="px-4 py-2.5 text-right">
                        {isAdded ? (
                          <span className="flex items-center justify-end gap-1 text-xs text-green-600 font-medium">
                            <Check size={12} /> Added
                          </span>
                        ) : (
                          <button
                            onClick={() => addOne(i, a)}
                            disabled={isSaving || addingAll}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 ml-auto"
                          >
                            <Plus size={11} />{isSaving ? '…' : 'Add'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="bg-gray-50 border-t border-gray-200">
                <tr>
                  <td colSpan={4} className="px-4 py-2.5 text-xs text-gray-500">
                    {plan.length} transaction{plan.length !== 1 ? 's' : ''} across {uniqueAccounts} account{uniqueAccounts !== 1 ? 's' : ''}
                    {added.size > 0 && <span className="ml-2 text-green-600">· {added.size} added</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs font-bold text-blue-700 tabular-nums">{fmt(allocatedTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
          {leftover > 0.01 && (
            <div className="mx-4 my-3 flex items-center gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
              <AlertTriangle size={13} />
              <span>Cannot allocate <strong>AED {fmt(leftover)}</strong> — insufficient monthly capacity across all accounts</span>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
          <div>
            {plan && plan.length > 0 && !allAdded && (
              <button
                onClick={addAll}
                disabled={addingAll}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {addingAll ? 'Adding…' : 'Add All'}
              </button>
            )}
            {allAdded && (
              <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                <Check size={14} /> All deposits added
              </span>
            )}
          </div>
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grouped table header ───────────────────────────────────────────────────────

function GroupedTableHead({ firstColLabel, canEdit }: { firstColLabel: string; canEdit: boolean }) {
  return (
    <thead className="border-b border-gray-200 bg-gray-50">
      <tr>
        <th className="w-10 pl-4 py-3" />
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{firstColLabel}</th>
        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Accounts</th>
        <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Total (AED)</th>
        {canEdit && <th className="w-20 px-4 py-3" />}
      </tr>
    </thead>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CashDepositsTracker() {
  const { canEdit } = useAuth();

  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [viewMode, setViewMode] = useState<ViewMode>('category');
  const [dateMode, setDateMode] = useState<'current_month' | 'custom'>('current_month');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const [sortKey, setSortKey] = useState<SortKey>('category');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Expand state per view
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [expandedGroupRowKeys, setExpandedGroupRowKeys] = useState<Set<string>>(new Set());
  const [expandedBanks, setExpandedBanks] = useState<Set<string>>(new Set());
  const [expandedBankRowKeys, setExpandedBankRowKeys] = useState<Set<string>>(new Set());
  const [expandedOwners, setExpandedOwners] = useState<Set<string>>(new Set());
  const [expandedOwnerRowKeys, setExpandedOwnerRowKeys] = useState<Set<string>>(new Set());

  const [depositModal, setDepositModal] = useState<{ company: CompanyRow; deposit: Deposit | null } | null>(null);
  const [limitsModal, setLimitsModal] = useState<CompanyRow | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);

  const { from: effectiveFrom, to: effectiveTo } = useMemo(
    () => getEffectiveDates(dateMode, fromDate, toDate),
    [dateMode, fromDate, toDate],
  );

  async function load() {
    if (!effectiveFrom || !effectiveTo) return;
    setLoading(true);
    try {
      const data = await fetchCashDeposits(effectiveFrom, effectiveTo);
      setRows(data.rows);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [effectiveFrom, effectiveTo]); // eslint-disable-line

  function handleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'total_deposits' ? 'desc' : key === 'category' ? 'desc' : 'asc'); }
  }

  const sorted = useMemo(() => sortRows(rows, sortKey, sortDir), [rows, sortKey, sortDir]);

  // Brand groups (company view)
  const brandGroups = useMemo(() => {
    const map = new Map<string, CompanyRow[]>();
    for (const c of rows) {
      const core = getCoreCompanyName(c.company_name);
      if (!map.has(core)) map.set(core, []);
      map.get(core)!.push(c);
    }
    return Array.from(map.entries())
      .map(([core_name, comps]) => ({
        core_name,
        companies: comps,
        total_deposits: comps.reduce((s, c) => s + c.total_deposits, 0),
      }))
      .sort((a, b) => a.core_name.localeCompare(b.core_name));
  }, [rows]);

  // Bank groups
  const bankGroups = useMemo(() => byName(
    rows,
    (r) => getBankName(r.bank_account),
    (k) => ({ label: k }),
  ), [rows]);

  // Owner groups
  const ownerGroups = useMemo(() => byName(
    rows,
    (r) => r.owner_name || '—',
    (k) => ({ label: k }),
  ), [rows]);

  function toggleSet<T>(prev: Set<T>, val: T): Set<T> {
    const next = new Set(prev);
    if (next.has(val)) next.delete(val); else next.add(val);
    return next;
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this deposit?')) return;
    await deleteCashDeposit(id);
    await load();
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  const categoryColSpan = canEdit ? 7 : 6;
  const groupedColSpan  = canEdit ? 5 : 4;

  function categoryBadge(cat: string | null) { return <CategoryBadge cat={cat} />; }

  function limitBadge(status: ReturnType<typeof getLimitStatus>) {
    if (status === 'exceeded') return (
      <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-red-100 text-red-700 rounded-full whitespace-nowrap">
        <AlertTriangle size={10} /> LIMIT REACHED
      </span>
    );
    if (status === 'warning') return (
      <span className="flex items-center gap-1 px-2 py-0.5 text-xs font-semibold bg-amber-100 text-amber-700 rounded-full whitespace-nowrap">
        <AlertTriangle size={10} /> NEAR LIMIT
      </span>
    );
    return null;
  }

  function rowBg(status: ReturnType<typeof getLimitStatus>, expanded: boolean) {
    if (status === 'exceeded') return 'bg-red-50';
    if (status === 'warning') return 'bg-amber-50';
    return expanded ? 'bg-blue-50/20' : 'bg-white hover:bg-gray-50/60';
  }

  function txSubRows(company: CompanyRow) {
    const key = rowKey(company);
    if (company.deposits.length === 0) {
      return (
        <tr key={`empty-${key}`}>
          <td colSpan={categoryColSpan} className="px-8 py-3 text-xs text-gray-400 italic bg-gray-50/60 border-b border-gray-100">
            No deposits recorded in this period
          </td>
        </tr>
      );
    }
    return (
      <tr key={`txrows-${key}`}>
        <td colSpan={categoryColSpan} className="p-0 border-b border-gray-100">
          <table className="w-full text-xs bg-gray-50/40">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="pl-14 pr-4 py-2 text-left text-gray-400 font-medium w-32">Date</th>
                <th className="px-4 py-2 text-left text-gray-400 font-medium">Description</th>
                <th className="px-4 py-2 text-right text-gray-400 font-medium w-36">Amount (AED)</th>
                <th className="px-4 py-2 text-right text-gray-400 font-medium w-40">Running Total</th>
                {canEdit && <th className="px-4 py-2 w-16" />}
              </tr>
            </thead>
            <tbody>
              {company.deposits.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 last:border-0 hover:bg-white/60">
                  <td className="pl-14 pr-4 py-2 text-gray-600">{d.date}</td>
                  <td className="px-4 py-2 text-gray-700">{d.description || <span className="text-gray-400 italic">—</span>}</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-800">
                    {d.amount > company.per_tx_limit && (
                      <AlertTriangle size={10} className="inline text-amber-500 mr-1 -mt-0.5" />
                    )}
                    {fmt(d.amount)}
                  </td>
                  <td className="px-4 py-2 text-right text-blue-700 font-semibold tabular-nums">{fmt(d.running_total)}</td>
                  {canEdit && (
                    <td className="px-4 py-2">
                      <div className="flex gap-2 justify-end">
                        <button onClick={() => setDepositModal({ company, deposit: d })} className="text-gray-400 hover:text-blue-600 transition-colors">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => handleDelete(d.id)} className="text-gray-400 hover:text-red-600 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </td>
      </tr>
    );
  }

  function companyRow(company: CompanyRow, isExpanded: boolean, onToggle: () => void, indent = false) {
    const status = getLimitStatus(company);
    const key = rowKey(company);
    return (
      <>
        <tr
          key={`row-${key}`}
          onClick={onToggle}
          className={cn('border-b border-gray-100 cursor-pointer transition-colors',
            rowBg(status, isExpanded),
            indent && 'border-l-[3px] border-l-slate-400',
          )}
        >
          <td className={cn('py-3 w-10', indent ? 'pl-10' : 'pl-4')}>
            {isExpanded ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronRight size={14} className="text-gray-400" />}
          </td>
          <td className="px-4 py-3 w-20">{categoryBadge(company.category)}</td>
          <td className="px-4 py-3">
            <div className="font-medium text-gray-800 text-sm">{company.company_name}</div>
            {company.owner_name && <div className="text-xs text-gray-400 mt-0.5">{company.owner_name}</div>}
          </td>
          <td className="px-4 py-3 text-xs text-gray-500 tabular-nums whitespace-nowrap">
            {company.bank_account || <span className="text-gray-300">—</span>}
          </td>
          <td className="px-4 py-3 w-44">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-400 tabular-nums">
                {fmtK(company.per_tx_limit)} tx · {fmtK(company.monthly_limit)} mo
              </span>
              {canEdit && company.bank_account !== null && (
                <button
                  onClick={(e) => { e.stopPropagation(); setLimitsModal(company); }}
                  className="text-gray-300 hover:text-blue-500 transition-colors flex-shrink-0"
                  title="Edit limits"
                >
                  <SlidersHorizontal size={12} />
                </button>
              )}
            </div>
          </td>
          <td className="px-4 py-3 text-right">
            <div className="flex items-center justify-end gap-2">
              {limitBadge(status)}
              <span className={cn('font-semibold text-sm tabular-nums',
                status === 'exceeded' ? 'text-red-700' :
                status === 'warning' ? 'text-amber-700' : 'text-gray-800')}>
                AED {fmt(company.total_deposits)}
              </span>
            </div>
          </td>
          {canEdit && (
            <td className="px-4 py-3 w-20 text-right">
              <button
                onClick={(e) => { e.stopPropagation(); setDepositModal({ company, deposit: null }); }}
                className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 ml-auto"
              >
                <Plus size={11} /> Add
              </button>
            </td>
          )}
        </tr>
        {isExpanded && txSubRows(company)}
      </>
    );
  }

  // Shared renderer for bank / owner grouped views
  function renderGroupedRows(
    groups: { key: string; label: string; subtitle?: string; rows: CompanyRow[]; total_deposits: number }[],
    expandedGroupsSet: Set<string>,
    toggleGroupFn: (k: string) => void,
    expandedRowKeysSet: Set<string>,
    toggleRowFn: (k: string) => void,
  ) {
    return groups.map((group) => {
      const isGroupExpanded = expandedGroupsSet.has(group.key);
      return (
        <Fragment key={`grp-${group.key}`}>
          <tr
            onClick={() => toggleGroupFn(group.key)}
            className={cn(
              'border-b border-gray-200 cursor-pointer transition-colors',
              isGroupExpanded ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-50 hover:bg-gray-100',
            )}
          >
            <td className="pl-4 py-3 w-10">
              {isGroupExpanded
                ? <ChevronDown size={14} className="text-slate-300" />
                : <ChevronRight size={14} className="text-gray-500" />}
            </td>
            <td className="px-4 py-3 font-semibold text-sm" colSpan={2}>
              <span className={isGroupExpanded ? 'text-white' : 'text-gray-800'}>{group.label}</span>
              {group.subtitle && (
                <span className={cn('ml-2 text-xs font-normal', isGroupExpanded ? 'text-slate-300' : 'text-gray-400')}>
                  {group.subtitle}
                </span>
              )}
            </td>
            <td className={cn('px-4 py-3 text-right text-xs', isGroupExpanded ? 'text-slate-300' : 'text-gray-400')}>
              {group.rows.length} {group.rows.length === 1 ? 'account' : 'accounts'}
            </td>
            <td className="px-4 py-3 text-right">
              <span className={cn('font-semibold text-sm tabular-nums', isGroupExpanded ? 'text-white' : 'text-gray-700')}>
                AED {fmt(group.total_deposits)}
              </span>
            </td>
            {canEdit && <td className="px-4 py-3" />}
          </tr>

          {isGroupExpanded && group.rows.map((c) =>
            companyRow(
              c,
              expandedRowKeysSet.has(rowKey(c)),
              () => toggleRowFn(rowKey(c)),
              true,
            ),
          )}

          {isGroupExpanded && (
            <tr>
              <td colSpan={groupedColSpan} className="h-1 bg-slate-200" />
            </tr>
          )}
        </Fragment>
      );
    });
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="p-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-gray-900">Cash Deposit Tracker</h1>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPlanner(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-blue-200 text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <Calculator size={13} />
              Large Deposit
            </button>
          <div className="flex bg-gray-100 rounded-lg p-0.5 gap-0.5">
            {VIEW_TABS.map(({ mode, label }) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                className={cn('px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                  viewMode === mode ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
              >
                {label}
              </button>
            ))}
          </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-lg px-4 py-3">
          <button
            onClick={() => setDateMode('current_month')}
            className={cn('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
              dateMode === 'current_month' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-300 hover:border-gray-400')}
          >
            Current Month
          </button>
          <button
            onClick={() => setDateMode('custom')}
            className={cn('px-3 py-1.5 text-xs font-medium rounded-md border transition-colors',
              dateMode === 'custom' ? 'bg-blue-600 text-white border-blue-600' : 'text-gray-600 border-gray-300 hover:border-gray-400')}
          >
            Custom Range
          </button>
          {dateMode === 'custom' && (
            <div className="flex items-center gap-2 ml-1">
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)}
                className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
              <span className="text-gray-400 text-xs">to</span>
              <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)}
                className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400" />
            </div>
          )}
          <span className="ml-auto text-xs text-gray-400">{effectiveFrom} — {effectiveTo}</span>
        </div>

        {/* Table */}
        <div key={viewMode} className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
          ) : viewMode === 'category' ? (

            // ── Category view ────────────────────────────────────────────────
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="w-10 pl-4 py-3" />
                  <SortHeader label="Cat." col="category" current={sortKey} dir={sortDir} onSort={handleSort} className="w-20" />
                  <SortHeader label="Company" col="company_name" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <SortHeader label="Bank Account" col="bank_account" current={sortKey} dir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Limits</th>
                  <SortHeader label="Total Deposits (AED)" col="total_deposits" current={sortKey} dir={sortDir} onSort={handleSort} className="text-right" />
                  {canEdit && <th className="w-20 px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr><td colSpan={categoryColSpan} className="py-16 text-center text-sm text-gray-400">No companies found</td></tr>
                ) : sorted.map((c, i) => (
                  <Fragment key={rowKey(c)}>
                    {companyRow(c, expandedIds.has(rowKey(c)), () => setExpandedIds((p) => toggleSet(p, rowKey(c))))}
                    {/* Company separator — thicker bar after last account of each company */}
                    {sorted[i + 1]?.company_id !== c.company_id && i < sorted.length - 1 && (
                      <tr>
                        <td colSpan={categoryColSpan} className="h-[3px] bg-slate-200 p-0" />
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>

          ) : viewMode === 'bank' ? (

            // ── Bank view ────────────────────────────────────────────────────
            <table className="w-full">
              <GroupedTableHead firstColLabel="Bank" canEdit={canEdit} />
              <tbody>
                {bankGroups.length === 0
                  ? <tr><td colSpan={groupedColSpan} className="py-16 text-center text-sm text-gray-400">No data</td></tr>
                  : renderGroupedRows(
                      bankGroups,
                      expandedBanks,
                      (k) => setExpandedBanks((p) => toggleSet(p, k)),
                      expandedBankRowKeys,
                      (k) => setExpandedBankRowKeys((p) => toggleSet(p, k)),
                    )}
              </tbody>
            </table>

          ) : viewMode === 'owner' ? (

            // ── Owner view ───────────────────────────────────────────────────
            <table className="w-full">
              <GroupedTableHead firstColLabel="Owner" canEdit={canEdit} />
              <tbody>
                {ownerGroups.length === 0
                  ? <tr><td colSpan={groupedColSpan} className="py-16 text-center text-sm text-gray-400">No data</td></tr>
                  : renderGroupedRows(
                      ownerGroups,
                      expandedOwners,
                      (k) => setExpandedOwners((p) => toggleSet(p, k)),
                      expandedOwnerRowKeys,
                      (k) => setExpandedOwnerRowKeys((p) => toggleSet(p, k)),
                    )}
              </tbody>
            </table>

          ) : (

            // ── Brand / company view ─────────────────────────────────────────
            <table className="w-full">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  <th className="w-10 pl-4 py-3" />
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Brand Group</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-24">Companies</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">Combined Total (AED)</th>
                  {canEdit && <th className="w-20 px-4 py-3" />}
                </tr>
              </thead>
              <tbody>
                {brandGroups.map((group) => {
                  const groupExpanded = expandedGroups.has(group.core_name);
                  return (
                    <Fragment key={`g-${group.core_name}`}>
                      <tr
                        onClick={() => setExpandedGroups((p) => toggleSet(p, group.core_name))}
                        className={cn(
                          'border-b border-gray-200 cursor-pointer transition-colors',
                          groupExpanded ? 'bg-slate-700 hover:bg-slate-600' : 'bg-gray-50 hover:bg-gray-100',
                        )}
                      >
                        <td className="pl-4 py-3 w-10">
                          {groupExpanded
                            ? <ChevronDown size={14} className="text-slate-300" />
                            : <ChevronRight size={14} className="text-gray-500" />}
                        </td>
                        <td className="px-4 py-3" colSpan={2}>
                          <span className={cn('font-semibold text-sm', groupExpanded ? 'text-white' : 'text-gray-800')}>
                            {group.core_name}
                          </span>
                          <span className={cn('ml-2 text-xs', groupExpanded ? 'text-slate-300' : 'text-gray-400')}>
                            {[...new Set(group.companies.map((c) => c.category).filter(Boolean))].sort().join(', ')}
                          </span>
                        </td>
                        <td className={cn('px-4 py-3 text-right', groupExpanded ? 'text-slate-200' : 'text-gray-500')}>
                          <span className="text-xs">
                            {group.companies.length} {group.companies.length === 1 ? 'company' : 'companies'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={cn('font-semibold text-sm tabular-nums', groupExpanded ? 'text-white' : 'text-gray-700')}>
                            AED {fmt(group.total_deposits)}
                          </span>
                        </td>
                        {canEdit && <td className="px-4 py-3" />}
                      </tr>
                      {groupExpanded && group.companies.map((c) =>
                        companyRow(
                          c,
                          expandedGroupRowKeys.has(rowKey(c)),
                          () => setExpandedGroupRowKeys((p) => toggleSet(p, rowKey(c))),
                          true,
                        ),
                      )}
                      {groupExpanded && (
                        <tr>
                          <td colSpan={canEdit ? 6 : 5} className="h-1 bg-slate-200" />
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Deposit modal */}
      {depositModal && (
        <DepositModal
          company={depositModal.company}
          deposit={depositModal.deposit}
          onClose={() => setDepositModal(null)}
          onSave={async (dto) => {
            if (depositModal.deposit) {
              await updateCashDeposit(depositModal.deposit.id, dto);
            } else {
              await createCashDeposit({
                company_id: depositModal.company.company_id,
                bank_account: depositModal.company.bank_account,
                ...dto,
              });
            }
            setDepositModal(null);
            await load();
          }}
        />
      )}

      {/* Company limits modal */}
      {limitsModal && (
        <CompanyLimitsModal
          company={limitsModal}
          onClose={() => setLimitsModal(null)}
          onSave={async (dto) => {
            await updateCompanyDepositLimits(limitsModal.company_id, limitsModal.bank_account, dto);
            setLimitsModal(null);
            await load();
          }}
        />
      )}

      {/* Deposit planner modal */}
      {showPlanner && (
        <DepositPlannerModal
          rows={rows}
          onClose={() => setShowPlanner(false)}
          onDepositsAdded={load}
        />
      )}
    </Layout>
  );
}
