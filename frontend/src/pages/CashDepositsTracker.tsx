import { Fragment, useState, useEffect, useMemo, useRef } from 'react';
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

// Aggregated view of a company across all its bank accounts
interface CompanyGroup {
  company_id: number;
  category: string | null;
  company_name: string;
  owner_name: string | null;
  monthly_limit: number;
  per_tx_limit: number;
  total_deposits: number; // sum across all bank accounts
  accounts: CompanyRow[];  // only accounts where bank_account !== null
  last_transaction_date: string | null;
}

type ViewMode = 'category' | 'bank' | 'owner' | 'company';
type CatFilter = 'all' | 'A' | 'B' | 'C';

// VIEW_TABS kept for future use — only 'category' is rendered
const VIEW_TABS: { mode: ViewMode; label: string }[] = [
  { mode: 'category', label: 'Category' },
  { mode: 'bank',     label: 'By Bank'  },
  { mode: 'owner',    label: 'By Owner' },
  { mode: 'company',  label: 'By Brand' },
];
void VIEW_TABS; // suppress unused warning

// ── Pure helpers ───────────────────────────────────────────────────────────────

function rowKey(c: CompanyRow): string {
  return `${c.company_id}:${c.bank_account ?? '__none__'}`;
}

function getBankName(bankAccount: string | null): string {
  if (!bankAccount) return 'No Account';
  const m = bankAccount.match(/^([A-Z]{2,})/);
  return m ? m[1] : bankAccount.split(/[\s\-_]/)[0].toUpperCase() || 'Unknown';
}
void getBankName; // kept for hidden views

function getEffectiveDates(mode: 'current_month' | 'custom', from: string, to: string) {
  if (mode === 'current_month') {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = String(new Date(y, now.getMonth() + 1, 0).getDate()).padStart(2, '0');
    return { from: `${y}-${m}-01`, to: `${y}-${m}-${lastDay}` };
  }
  // from/to are 'YYYY-MM' strings
  if (!from || !to) return { from: '', to: '' };
  const [ty, tm] = to.split('-').map(Number);
  const lastDay = String(new Date(ty, tm, 0).getDate()).padStart(2, '0');
  return { from: `${from}-01`, to: `${ty}-${String(tm).padStart(2, '0')}-${lastDay}` };
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
  let n = name.replace(/L\.L\.C/gi, 'LLC').replace(/\(.*?\)/g, '').trim().replace(/-\s*$/, '').trim().split(/\s+-\s+/)[0].trim();
  const words = n.toUpperCase().split(/[\s.&,/+]+/).filter((w) => w.length > 0);
  while (words.length > 1 && CORP_DESIGNATORS.has(words[words.length - 1])) words.pop();
  while (words.length > 1 && BUSINESS_WORDS.has(words[words.length - 1])) words.pop();
  return words.join(' ');
}
void getCoreCompanyName; // kept for hidden views

function getLimitStatus(row: CompanyRow): 'exceeded' | 'warning' | 'ok' {
  if (row.total_deposits >= row.monthly_limit) return 'exceeded';
  if (row.total_deposits >= row.monthly_limit * 0.8) return 'warning';
  return 'ok';
}
void getLimitStatus; // kept for hidden views

function getGroupLimitStatus(g: CompanyGroup): 'exceeded' | 'warning' | 'ok' {
  if (g.total_deposits >= g.monthly_limit) return 'exceeded';
  if (g.total_deposits >= g.monthly_limit * 0.8) return 'warning';
  return 'ok';
}

function buildCompanyGroups(rows: CompanyRow[]): CompanyGroup[] {
  const map = new Map<number, CompanyGroup>();
  for (const r of rows) {
    if (!map.has(r.company_id)) {
      map.set(r.company_id, {
        company_id: r.company_id,
        category: r.category,
        company_name: r.company_name,
        owner_name: r.owner_name,
        monthly_limit: r.monthly_limit,
        per_tx_limit: r.per_tx_limit,
        total_deposits: 0,
        accounts: [],
        last_transaction_date: null,
      });
    }
    const g = map.get(r.company_id)!;
    if (r.bank_account !== null) {
      g.total_deposits = parseFloat((g.total_deposits + r.total_deposits).toFixed(2));
      g.accounts.push(r);
      for (const d of r.deposits) {
        if (!g.last_transaction_date || d.date > g.last_transaction_date) {
          g.last_transaction_date = d.date;
        }
      }
    }
  }
  // Only show companies that have at least one bank account
  return Array.from(map.values()).filter((g) => g.accounts.length > 0);
}

const CAT_ORDER: Record<string, number> = { C: 0, B: 1, A: 2 };

function sortGroups(groups: CompanyGroup[], catFilter: CatFilter): CompanyGroup[] {
  const filtered = catFilter === 'all' ? groups : groups.filter((g) => g.category === catFilter);
  return [...filtered].sort((a, b) => {
    // 1. Category: C → B → A → null
    const aO = CAT_ORDER[a.category ?? ''] ?? 3;
    const bO = CAT_ORDER[b.category ?? ''] ?? 3;
    if (aO !== bO) return aO - bO;
    // 2. Most available capacity first
    const aAvail = a.monthly_limit - a.total_deposits;
    const bAvail = b.monthly_limit - b.total_deposits;
    if (Math.abs(aAvail - bAvail) > 0.01) return bAvail - aAvail;
    // 3. Most active bank accounts first
    if (a.accounts.length !== b.accounts.length) return b.accounts.length - a.accounts.length;
    // 4. Oldest last transaction first (never-used = null = highest priority)
    if (!a.last_transaction_date && !b.last_transaction_date) return a.company_name.localeCompare(b.company_name);
    if (!a.last_transaction_date) return -1;
    if (!b.last_transaction_date) return 1;
    return a.last_transaction_date.localeCompare(b.last_transaction_date);
  });
}

function fmt(n: number): string {
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

function fmtMonth(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function todayStr(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// ── UI primitives ──────────────────────────────────────────────────────────────

function UtilizationBar({ value, limit }: { value: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (value / limit) * 100) : 0;
  const fill = pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-400' : 'bg-emerald-400';
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className={cn('h-full rounded-full transition-all', fill)} style={{ width: `${pct}%` }} />
    </div>
  );
}

function CategoryBadge({ cat }: { cat: string | null }) {
  if (!cat) return <span className="text-gray-300 text-xs">—</span>;
  const s: Record<string, string> = { A: 'bg-amber-500 text-white', B: 'bg-blue-500 text-white', C: 'bg-slate-500 text-white' };
  return (
    <span className={cn('inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold', s[cat] ?? 'bg-gray-400 text-white')}>
      {cat}
    </span>
  );
}

// ── Deposit planner ─────────────────────────────────────────────────────────────

interface PlanAllocation {
  company_id: number;
  company_name: string;
  bank_account: string;
  category: string | null;
  amount: number;
  remaining_after: number;
}

// Rotates through accounts: unused ones first, then by lowest volume
function buildDepositPlan(total: number, groups: CompanyGroup[]): { allocations: PlanAllocation[]; leftover: number } {
  type Slot = {
    company: CompanyGroup;
    sortedAccounts: CompanyRow[];
    accountIdx: number;
    companyAvailable: number;
    used: number;
  };

  const slots: Slot[] = groups
    .filter((g) => g.monthly_limit - g.total_deposits > 0.01)
    .map((g) => ({
      company: g,
      // Prefer accounts with 0 deposits this period, then lowest volume
      sortedAccounts: [...g.accounts].sort((a, b) => {
        if (a.total_deposits === 0 && b.total_deposits > 0) return -1;
        if (b.total_deposits === 0 && a.total_deposits > 0) return 1;
        return a.total_deposits - b.total_deposits;
      }),
      accountIdx: 0,
      companyAvailable: g.monthly_limit - g.total_deposits,
      used: 0,
    }))
    .sort((a, b) => {
      const aO = CAT_ORDER[a.company.category ?? ''] ?? 3;
      const bO = CAT_ORDER[b.company.category ?? ''] ?? 3;
      if (aO !== bO) return aO - bO;
      return b.companyAvailable - a.companyAvailable;
    });

  const allocations: PlanAllocation[] = [];
  let remaining = total;
  let progress = true;

  while (remaining > 0.01 && progress) {
    progress = false;
    for (const slot of slots) {
      if (remaining <= 0.01) break;
      const room = parseFloat((slot.companyAvailable - slot.used).toFixed(2));
      if (room <= 0.01) continue;
      const account = slot.sortedAccounts[slot.accountIdx % slot.sortedAccounts.length];
      const chunk = parseFloat(Math.min(slot.company.per_tx_limit, room, remaining).toFixed(2));
      if (chunk <= 0) continue;
      allocations.push({
        company_id: slot.company.company_id,
        company_name: slot.company.company_name,
        bank_account: account.bank_account!,
        category: slot.company.category,
        amount: chunk,
        remaining_after: parseFloat((room - chunk).toFixed(2)),
      });
      slot.used = parseFloat((slot.used + chunk).toFixed(2));
      slot.accountIdx++;
      remaining = parseFloat((remaining - chunk).toFixed(2));
      progress = true;
    }
  }

  return { allocations, leftover: remaining > 0.01 ? remaining : 0 };
}

// ── Month picker (same as Dashboard deposit graph) ────────────────────────────

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();
  const [year, setYear] = useState(() => parseInt(value.split('-')[0]));
  const selMonth = parseInt(value.split('-')[1]) - 1;
  const selYear  = parseInt(value.split('-')[0]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function select(m: number) {
    onChange(`${year}-${String(m + 1).padStart(2, '0')}`);
    setOpen(false);
  }

  function isFuture(m: number) {
    return year > now.getFullYear() || (year === now.getFullYear() && m > now.getMonth());
  }

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors">
        {MONTH_NAMES[selMonth]} {selYear}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-400">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52">
          <div className="flex items-center justify-between mb-2.5">
            <button onClick={() => setYear(y => y - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <span className="text-xs font-semibold text-gray-800">{year}</span>
            <button onClick={() => setYear(y => y + 1)} disabled={year >= now.getFullYear()}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((name, m) => {
              const isSelected = m === selMonth && year === selYear;
              const disabled   = isFuture(m);
              return (
                <button key={m} onClick={() => !disabled && select(m)} disabled={disabled}
                  className={`px-2 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    isSelected ? 'bg-blue-600 text-white' :
                    disabled   ? 'text-gray-300 cursor-default' :
                                 'text-gray-600 hover:bg-gray-100'
                  }`}>
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shared input/button styles ─────────────────────────────────────────────────

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 transition-colors';
const labelCls = 'block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5';
const btnPrimary = 'px-4 py-2.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium';
const btnSecondary = 'px-4 py-2.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors font-medium';

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
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-7 w-[420px] border border-gray-100">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-900">{deposit ? 'Edit Deposit' : 'New Deposit'}</h2>
          <p className="text-sm text-gray-500 mt-1">{company.company_name}</p>
          {company.bank_account && <p className="text-xs text-gray-400 mt-0.5 font-mono">{company.bank_account}</p>}
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Enter description" required className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Amount (AED)</label>
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min="1" step="1" required placeholder="0"
              className={cn(inputCls, 'font-mono', overTxLimit && 'border-amber-300 focus:ring-amber-400/20 focus:border-amber-400')} />
            {overTxLimit && (
              <div className="flex items-center gap-1.5 mt-2 px-3 py-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg">
                <AlertTriangle size={11} /> Exceeds per-transaction limit of AED {fmt(company.per_tx_limit)}
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : deposit ? 'Update' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Company limits modal ───────────────────────────────────────────────────────

interface LimitsTarget {
  company_id: number;
  company_name: string;
  per_tx_limit: number;
  monthly_limit: number;
  total_deposits: number;
  first_bank_account: string | null;
}

function CompanyLimitsModal({ company, onClose, onSave }: {
  company: LimitsTarget;
  onClose: () => void;
  onSave: (dto: { per_tx_limit: number; monthly_limit: number }) => Promise<void>;
}) {
  const [perTx, setPerTx] = useState(String(company.per_tx_limit));
  const [monthly, setMonthly] = useState(String(company.monthly_limit));
  const [saving, setSaving] = useState(false);
  const monthlyNum = parseFloat(monthly) || 0;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try { await onSave({ per_tx_limit: parseFloat(perTx), monthly_limit: monthlyNum }); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl p-7 w-[400px] border border-gray-100">
        <div className="mb-6">
          <h2 className="text-base font-semibold text-gray-900">Deposit Limits</h2>
          <p className="text-sm text-gray-500 mt-1">{company.company_name}</p>
          <p className="text-xs text-gray-400 mt-0.5">Applies to the company total across all bank accounts</p>
          <div className="mt-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
            <div className="flex justify-between text-xs text-gray-400 mb-1.5">
              <span>Current utilization</span>
              <span className="font-mono font-semibold text-gray-600">
                {monthlyNum > 0 ? Math.min(100, Math.round((company.total_deposits / monthlyNum) * 100)) : 0}%
              </span>
            </div>
            <UtilizationBar value={company.total_deposits} limit={monthlyNum} />
            <p className="text-xs text-gray-400 mt-1.5 font-mono">AED {fmt(company.total_deposits)} used across all accounts</p>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelCls}>Per Transaction Limit (AED)</label>
            <input type="number" value={perTx} onChange={(e) => setPerTx(e.target.value)} min="1" step="1" required className={cn(inputCls, 'font-mono')} />
          </div>
          <div>
            <label className={labelCls}>Monthly Limit — Company Total (AED)</label>
            <input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} min="1" step="1" required className={cn(inputCls, 'font-mono')} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className={btnSecondary}>Cancel</button>
            <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Deposit planner modal ──────────────────────────────────────────────────────

function DepositPlannerModal({ groups, onClose, onDepositsAdded }: {
  groups: CompanyGroup[];
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
  const [descError, setDescError] = useState(false);

  function calculate() {
    const n = parseFloat(amount.replace(/,/g, ''));
    if (!n || n <= 0) return;
    const result = buildDepositPlan(n, groups);
    setPlan(result.allocations);
    setLeftover(result.leftover);
    setAdded(new Set());
  }

  async function addOne(i: number, alloc: PlanAllocation) {
    if (!description.trim()) { setDescError(true); return; }
    setDescError(false);
    setSaving((prev) => new Set(prev).add(i));
    try {
      await createCashDeposit({ company_id: alloc.company_id, bank_account: alloc.bank_account, date: todayStr(), description: description.trim(), amount: alloc.amount });
      setAdded((prev) => new Set(prev).add(i));
      onDepositsAdded();
    } finally {
      setSaving((prev) => { const s = new Set(prev); s.delete(i); return s; });
    }
  }

  async function addAll() {
    if (!plan) return;
    if (!description.trim()) { setDescError(true); return; }
    setDescError(false);
    setAddingAll(true);
    try {
      for (let i = 0; i < plan.length; i++) {
        if (added.has(i)) continue;
        await createCashDeposit({ company_id: plan[i].company_id, bank_account: plan[i].bank_account, date: todayStr(), description: description.trim(), amount: plan[i].amount });
        setAdded((prev) => new Set(prev).add(i));
        onDepositsAdded();
      }
    } finally { setAddingAll(false); }
  }

  const allocatedTotal = plan ? plan.reduce((s, a) => s + a.amount, 0) : 0;
  const uniqueCompanies = plan ? new Set(plan.map((a) => a.company_id)).size : 0;
  const allAdded = plan !== null && plan.length > 0 && added.size === plan.length;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-[740px] max-h-[85vh] flex flex-col border border-gray-100">
        <div className="px-7 pt-7 pb-5 border-b border-gray-100">
          <h2 className="text-base font-semibold text-gray-900">Large Deposit Planner</h2>
          <p className="text-sm text-gray-400 mt-1">Prioritizes Cat C → B → A; rotates unused accounts first, then by lowest volume</p>
        </div>
        <div className="px-7 py-5 border-b border-gray-100 space-y-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className={labelCls}>Total Amount to Deposit (AED)</label>
              <input type="number" value={amount}
                onChange={(e) => { setAmount(e.target.value); setPlan(null); setAdded(new Set()); }}
                onKeyDown={(e) => e.key === 'Enter' && calculate()}
                placeholder="e.g. 2000000" min="1" autoFocus className={cn(inputCls, 'font-mono')} />
            </div>
            <button onClick={calculate} className={btnPrimary}>Find Split</button>
          </div>
          {plan && plan.length > 0 && (
            <div>
              <label className={labelCls}>Description <span className="normal-case font-normal text-gray-400">(required for all)</span></label>
              <input type="text" value={description}
                onChange={(e) => { setDescription(e.target.value); if (e.target.value.trim()) setDescError(false); }}
                placeholder="e.g. Cash deposit Jun 2026"
                className={cn(inputCls, descError && 'border-red-300 focus:ring-red-400/20 focus:border-red-400')} />
              {descError && <p className="text-xs text-red-500 mt-1.5">Description is required before adding deposits</p>}
            </div>
          )}
        </div>
        <div className="overflow-y-auto flex-1">
          {plan === null ? (
            <div className="py-20 text-center">
              <Calculator size={28} className="text-gray-200 mx-auto mb-3" />
              <p className="text-sm text-gray-400">Enter an amount and click Find Split</p>
            </div>
          ) : plan.length === 0 ? (
            <div className="py-20 text-center text-sm text-gray-400">No accounts have remaining capacity this month</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-gray-100 sticky top-0 bg-white">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-8">#</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-12">Cat</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Company</th>
                  <th className="px-3 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider">Account</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Deposit (AED)</th>
                  <th className="px-3 py-3 text-right text-xs font-semibold text-gray-400 uppercase tracking-wider">Co. Remaining After</th>
                  <th className="w-20 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {plan.map((a, i) => {
                  const isAdded = added.has(i);
                  const isSaving = saving.has(i);
                  return (
                    <tr key={i} className={cn('border-b border-gray-50 last:border-0 transition-colors', isAdded ? 'bg-emerald-50' : 'hover:bg-gray-50/50')}>
                      <td className="px-5 py-3 text-xs text-gray-300 tabular-nums font-mono">{i + 1}</td>
                      <td className="px-3 py-3"><CategoryBadge cat={a.category} /></td>
                      <td className="px-3 py-3 text-gray-800 font-medium text-xs">{a.company_name}</td>
                      <td className="px-3 py-3 text-gray-400 text-xs font-mono">{a.bank_account}</td>
                      <td className="px-3 py-3 text-right text-xs font-bold text-gray-900 tabular-nums font-mono">{fmt(a.amount)}</td>
                      <td className="px-3 py-3 text-right text-xs tabular-nums text-gray-400 font-mono">{fmt(a.remaining_after)}</td>
                      <td className="px-3 py-3 text-right">
                        {isAdded ? (
                          <span className="flex items-center justify-end gap-1 text-xs text-emerald-600 font-semibold"><Check size={12} /> Added</span>
                        ) : (
                          <button onClick={() => addOne(i, a)} disabled={isSaving || addingAll}
                            className="flex items-center gap-1 px-2.5 py-1 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 ml-auto font-medium transition-colors">
                            <Plus size={11} />{isSaving ? '…' : 'Add'}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t border-gray-100 bg-gray-50/60">
                <tr>
                  <td colSpan={4} className="px-5 py-3 text-xs text-gray-400">
                    {plan.length} deposit{plan.length !== 1 ? 's' : ''} across {uniqueCompanies} compan{uniqueCompanies !== 1 ? 'ies' : 'y'}
                    {added.size > 0 && <span className="ml-2 text-emerald-600 font-medium">· {added.size} added</span>}
                  </td>
                  <td className="px-3 py-3 text-right text-sm font-bold text-blue-700 tabular-nums font-mono">{fmt(allocatedTotal)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
          {leftover > 0.01 && (
            <div className="mx-5 my-3 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-700">
              <AlertTriangle size={13} className="flex-shrink-0" />
              <span>Cannot allocate <strong className="font-mono">AED {fmt(leftover)}</strong> — insufficient monthly capacity across all accounts</span>
            </div>
          )}
        </div>
        <div className="px-7 py-5 border-t border-gray-100 flex items-center justify-between">
          <div>
            {plan && plan.length > 0 && !allAdded && (
              <button onClick={addAll} disabled={addingAll}
                className="px-4 py-2.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 font-medium transition-colors">
                {addingAll ? 'Adding…' : `Add All ${plan.length} Deposits`}
              </button>
            )}
            {allAdded && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-semibold"><Check size={14} /> All deposits added</span>
            )}
          </div>
          <button onClick={onClose} className={btnSecondary}>Close</button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function CashDepositsTracker() {
  const { canEdit } = useAuth();

  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Date filter — month-based ('YYYY-MM')
  const [dateMode, setDateMode] = useState<'current_month' | 'custom'>('current_month');
  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');

  // Category filter
  const [catFilter, setCatFilter] = useState<CatFilter>('all');

  // Kept for hidden views (Bank / Owner / Brand)
  const [_viewMode] = useState<ViewMode>('category');
  void _viewMode;

  // Expand state for company→account→deposit hierarchy
  const [expandedCompanies, setExpandedCompanies] = useState<Set<number>>(new Set());
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  const [depositModal, setDepositModal] = useState<{ company: CompanyRow; deposit: Deposit | null } | null>(null);
  const [limitsModal, setLimitsModal] = useState<LimitsTarget | null>(null);
  const [showPlanner, setShowPlanner] = useState(false);
  const [sortCol, setSortCol] = useState<'company' | 'last_tx' | 'limits' | 'total' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  function handleSort(col: 'company' | 'last_tx' | 'limits' | 'total') {
    if (sortCol === col && sortDir === 'asc') { setSortCol(null); }
    else if (sortCol === col) { setSortDir('asc'); }
    else { setSortCol(col); setSortDir('desc'); }
  }

  const { from: effectiveFrom, to: effectiveTo } = useMemo(
    () => getEffectiveDates(dateMode, fromMonth, toMonth),
    [dateMode, fromMonth, toMonth],
  );

  async function load() {
    if (!effectiveFrom || !effectiveTo) return;
    setLoading(true);
    try {
      const data = await fetchCashDeposits(effectiveFrom, effectiveTo);
      setRows(data.rows);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [effectiveFrom, effectiveTo]); // eslint-disable-line

  const companyGroups = useMemo(() => buildCompanyGroups(rows), [rows]);
  const sortedGroups = useMemo(() => {
    const base = sortGroups(companyGroups, catFilter);
    if (!sortCol) return base;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      switch (sortCol) {
        case 'company': return dir * a.company_name.localeCompare(b.company_name);
        case 'last_tx': {
          if (!a.last_transaction_date && !b.last_transaction_date) return 0;
          if (!a.last_transaction_date) return dir;
          if (!b.last_transaction_date) return -dir;
          return dir * a.last_transaction_date.localeCompare(b.last_transaction_date);
        }
        case 'limits': return dir * (a.monthly_limit - b.monthly_limit);
        case 'total': return dir * (a.total_deposits - b.total_deposits);
        default: return 0;
      }
    });
  }, [companyGroups, catFilter, sortCol, sortDir]);

  const stats = useMemo(() => ({
    total: companyGroups.reduce((s, g) => s + g.total_deposits, 0),
    exceeded: companyGroups.filter((g) => getGroupLimitStatus(g) === 'exceeded').length,
    warning: companyGroups.filter((g) => getGroupLimitStatus(g) === 'warning').length,
    capacity: companyGroups.reduce((s, g) => s + Math.max(0, g.monthly_limit - g.total_deposits), 0),
  }), [companyGroups]);

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

  // Columns: chevron | cat | name | info | limits | deposits | [add]
  const totalCols = canEdit ? 7 : 6;

  function statusAccent(status: ReturnType<typeof getGroupLimitStatus>) {
    if (status === 'exceeded') return 'border-l-red-400';
    if (status === 'warning') return 'border-l-amber-400';
    return 'border-l-transparent';
  }

  function depositRows(account: CompanyRow) {
    if (account.deposits.length === 0) {
      return (
        <tr key={`empty-${rowKey(account)}`}>
          <td colSpan={totalCols} className="pl-24 pr-8 py-3 text-xs text-gray-400 italic bg-gray-50/20 border-b border-gray-50">
            No deposits recorded in this period
          </td>
        </tr>
      );
    }
    return (
      <tr key={`deps-${rowKey(account)}`}>
        <td colSpan={totalCols} className="p-0 border-b border-gray-100">
          <table className="w-full text-xs">
            <thead className="border-b border-gray-100 bg-gray-50/50">
              <tr>
                <th className="pl-24 pr-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-40">Date</th>
                <th className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-36">Amount (AED)</th>
                <th className="px-4 py-2.5 text-right text-[10px] font-semibold text-gray-400 uppercase tracking-wider w-40">Running (Account)</th>
                {canEdit && <th className="px-4 py-2.5 w-16" />}
              </tr>
            </thead>
            <tbody>
              {account.deposits.map((d) => (
                <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-blue-50/10 transition-colors">
                  <td className="pl-24 pr-4 py-2.5 text-gray-500 font-mono">{d.date}</td>
                  <td className="px-4 py-2.5 text-gray-600">{d.description || <span className="text-gray-300 italic">—</span>}</td>
                  <td className="px-4 py-2.5 text-right font-mono font-semibold text-gray-800">
                    {d.amount > account.per_tx_limit && <AlertTriangle size={10} className="inline text-amber-400 mr-1 -mt-0.5" />}
                    {fmt(d.amount)}
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono font-bold text-blue-600">{fmt(d.running_total)}</td>
                  {canEdit && (
                    <td className="px-4 py-2.5">
                      <div className="flex gap-2.5 justify-end">
                        <button onClick={() => setDepositModal({ company: account, deposit: d })} className="text-gray-300 hover:text-blue-500 transition-colors"><Pencil size={12} /></button>
                        <button onClick={() => handleDelete(d.id)} className="text-gray-300 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
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

  function accountSubRow(group: CompanyGroup, account: CompanyRow) {
    const key = rowKey(account);
    const isExpanded = expandedAccounts.has(key);
    return (
      <Fragment key={`acct-${key}`}>
        <tr onClick={() => setExpandedAccounts((p) => toggleSet(p, key))}
          className="border-b border-gray-50 cursor-pointer hover:bg-gray-50/40 transition-colors bg-white">
          {/* indent + chevron */}
          <td className="border-l-[3px] border-l-transparent pl-10 py-3 w-10">
            {isExpanded ? <ChevronDown size={12} className="text-gray-300" /> : <ChevronRight size={12} className="text-gray-300" />}
          </td>
          <td className="px-3 py-3 w-14" /> {/* cat column empty */}
          <td className="px-4 py-3" colSpan={2}>
            <span className="text-xs font-mono text-gray-500 font-medium">{account.bank_account}</span>
            {account.deposits.length > 0 && (
              <span className="ml-2 text-[10px] text-gray-300">{account.deposits.length} deposit{account.deposits.length !== 1 ? 's' : ''}</span>
            )}
          </td>
          <td className="px-4 py-3 w-36" /> {/* limits column empty */}
          <td className="px-4 py-3 text-right w-52">
            <span className={cn('font-mono text-sm tabular-nums', account.total_deposits > 0 ? 'text-gray-600 font-semibold' : 'text-gray-300')}>
              {account.total_deposits > 0 ? fmt(account.total_deposits) : '—'}
            </span>
          </td>
          {canEdit && (
            <td className="px-4 py-3 w-20">
              <button onClick={(e) => { e.stopPropagation(); setDepositModal({ company: account, deposit: null }); }}
                className="flex items-center gap-1 px-2.5 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 ml-auto font-medium transition-colors">
                <Plus size={11} /> Add
              </button>
            </td>
          )}
        </tr>
        {isExpanded && depositRows(account)}
      </Fragment>
    );
  }

  function companyGroupRow(group: CompanyGroup) {
    const status = getGroupLimitStatus(group);
    const isExpanded = expandedCompanies.has(group.company_id);
    const pct = group.monthly_limit > 0 ? Math.min(100, (group.total_deposits / group.monthly_limit) * 100) : 0;

    return (
      <Fragment key={`grp-${group.company_id}`}>
        <tr onClick={() => setExpandedCompanies((p) => toggleSet(p, group.company_id))}
          className={cn('border-b border-gray-50 cursor-pointer transition-colors',
            status === 'exceeded' ? 'hover:bg-red-50/30' :
            status === 'warning' ? 'hover:bg-amber-50/30' :
            isExpanded ? 'bg-blue-50/10 hover:bg-blue-50/20' : 'hover:bg-gray-50/60')}>
          <td className={cn('py-4 w-10 border-l-[3px] pl-3.5', statusAccent(status))}>
            {isExpanded ? <ChevronDown size={13} className="text-gray-300" /> : <ChevronRight size={13} className="text-gray-300" />}
          </td>
          <td className="px-3 py-4 w-14"><CategoryBadge cat={group.category} /></td>
          <td className="px-4 py-4">
            <div className="font-semibold text-gray-800 text-sm leading-tight">{group.company_name}</div>
            {group.owner_name && <div className="text-xs text-gray-400 mt-0.5">{group.owner_name}</div>}
          </td>
          <td className="px-4 py-4 w-44">
            <div className="text-xs text-gray-400">
              {group.accounts.length} account{group.accounts.length !== 1 ? 's' : ''}
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              Last: <span className={cn('font-mono', group.last_transaction_date ? 'text-gray-500' : 'text-gray-300')}>
                {fmtDate(group.last_transaction_date)}
              </span>
            </div>
          </td>
          <td className="px-4 py-4 w-36">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-gray-300 tabular-nums font-mono">{fmtK(group.per_tx_limit)} / {fmtK(group.monthly_limit)}</span>
              {canEdit && (
                <button onClick={(e) => {
                  e.stopPropagation();
                  setLimitsModal({ company_id: group.company_id, company_name: group.company_name, per_tx_limit: group.per_tx_limit, monthly_limit: group.monthly_limit, total_deposits: group.total_deposits, first_bank_account: group.accounts[0]?.bank_account ?? null });
                }}
                  className="text-gray-200 hover:text-blue-400 transition-colors flex-shrink-0" title="Edit company limits">
                  <SlidersHorizontal size={11} />
                </button>
              )}
            </div>
          </td>
          <td className="px-4 py-4 text-right w-52">
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-2">
                {status === 'exceeded' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-red-100 text-red-600 rounded uppercase tracking-wide">
                    <AlertTriangle size={9} /> Limit
                  </span>
                )}
                {status === 'warning' && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-600 rounded uppercase tracking-wide">
                    <AlertTriangle size={9} /> Near
                  </span>
                )}
                <span className={cn('font-mono font-bold text-sm tabular-nums',
                  status === 'exceeded' ? 'text-red-600' : status === 'warning' ? 'text-amber-600' : 'text-gray-800')}>
                  {fmt(group.total_deposits)}
                </span>
              </div>
              <div className="w-28"><UtilizationBar value={group.total_deposits} limit={group.monthly_limit} /></div>
              <span className="text-[10px] text-gray-300 font-mono">{pct.toFixed(0)}% of {fmtK(group.monthly_limit)}</span>
            </div>
          </td>
          {canEdit && <td className="px-4 py-4 w-20" />}
        </tr>
        {isExpanded && group.accounts.map((account) => accountSubRow(group, account))}
        {isExpanded && (
          <tr><td colSpan={totalCols} className="h-px bg-gray-100 p-0" /></tr>
        )}
      </Fragment>
    );
  }

  // ── Period label ───────────────────────────────────────────────────────────

  const periodLabel = useMemo(() => {
    if (dateMode === 'current_month') return fmtMonth(effectiveFrom.slice(0, 7));
    if (fromMonth && toMonth) {
      return fromMonth === toMonth ? fmtMonth(fromMonth) : `${fmtMonth(fromMonth)} → ${fmtMonth(toMonth)}`;
    }
    return '—';
  }, [dateMode, effectiveFrom, fromMonth, toMonth]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="min-h-screen bg-gray-50">
        <div className="px-8 py-6 space-y-5">

          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900 tracking-tight">Cash Deposit Tracker</h1>
              <p className="text-sm text-gray-400 mt-0.5">{periodLabel}</p>
            </div>
            <button onClick={() => setShowPlanner(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-blue-200 text-blue-700 bg-white rounded-lg hover:bg-blue-50 transition-colors shadow-sm">
              <Calculator size={13} /> Large Deposit
            </button>
          </div>

          {/* Summary stats */}
          {!loading && (
            <div className="grid grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Deposited</p>
                <p className="text-2xl font-bold text-gray-900 font-mono mt-2 tracking-tight">{fmtK(stats.total)}</p>
                <p className="text-xs text-gray-400 mt-0.5">AED this period</p>
              </div>
              <div className={cn('rounded-xl border px-5 py-4 shadow-sm', stats.exceeded > 0 ? 'bg-red-50 border-red-100' : 'bg-white border-gray-100')}>
                <p className={cn('text-xs font-semibold uppercase tracking-wide', stats.exceeded > 0 ? 'text-red-400' : 'text-gray-400')}>At Limit</p>
                <p className={cn('text-2xl font-bold font-mono mt-2 tracking-tight', stats.exceeded > 0 ? 'text-red-600' : 'text-gray-300')}>{stats.exceeded}</p>
                <p className={cn('text-xs mt-0.5', stats.exceeded > 0 ? 'text-red-400' : 'text-gray-300')}>{stats.exceeded === 1 ? 'company' : 'companies'}</p>
              </div>
              <div className={cn('rounded-xl border px-5 py-4 shadow-sm', stats.warning > 0 ? 'bg-amber-50 border-amber-100' : 'bg-white border-gray-100')}>
                <p className={cn('text-xs font-semibold uppercase tracking-wide', stats.warning > 0 ? 'text-amber-500' : 'text-gray-400')}>Near Limit</p>
                <p className={cn('text-2xl font-bold font-mono mt-2 tracking-tight', stats.warning > 0 ? 'text-amber-600' : 'text-gray-300')}>{stats.warning}</p>
                <p className={cn('text-xs mt-0.5', stats.warning > 0 ? 'text-amber-400' : 'text-gray-300')}>{stats.warning === 1 ? 'company' : 'companies'} ≥80%</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 px-5 py-4 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Available Capacity</p>
                <p className="text-2xl font-bold text-emerald-600 font-mono mt-2 tracking-tight">{fmtK(stats.capacity)}</p>
                <p className="text-xs text-gray-400 mt-0.5">AED remaining</p>
              </div>
            </div>
          )}

          {/* Filter bar */}
          <div className="flex items-center gap-3">
            {/* Date filter */}
            <div className="flex items-center gap-2 bg-white border border-gray-100 rounded-xl px-4 py-2.5 shadow-sm">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Period</span>
              <button onClick={() => setDateMode('current_month')}
                className={cn('px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  dateMode === 'current_month' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
                This Month
              </button>
              <button onClick={() => setDateMode('custom')}
                className={cn('px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                  dateMode === 'custom' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
                Custom
              </button>
              {dateMode === 'custom' && (
                <div className="flex items-center gap-2 ml-2 pl-2 border-l border-gray-100">
                  <MonthPicker value={fromMonth || currentMonthStr()} onChange={setFromMonth} />
                  <span className="text-gray-300 text-xs">→</span>
                  <MonthPicker value={toMonth || currentMonthStr()} onChange={setToMonth} />
                </div>
              )}
            </div>

            {/* Category filter */}
            <div className="flex items-center gap-1 bg-white border border-gray-100 rounded-xl px-3 py-2 shadow-sm">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide mr-1">Cat</span>
              {(['all', 'C', 'B', 'A'] as CatFilter[]).map((cat) => (
                <button key={cat} onClick={() => setCatFilter(cat)}
                  className={cn('px-3 py-1.5 text-xs font-semibold rounded-lg transition-all',
                    catFilter === cat
                      ? cat === 'all' ? 'bg-gray-700 text-white' : cat === 'C' ? 'bg-slate-500 text-white' : cat === 'B' ? 'bg-blue-500 text-white' : 'bg-amber-500 text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50')}>
                  {cat === 'all' ? 'All' : cat}
                </button>
              ))}
            </div>
          </div>

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
            ) : (
              <table className="w-full">
                <thead className="border-b border-gray-100">
                  <tr className="bg-gray-50/60">
                    <th className="w-10 pl-3.5 py-3.5" />
                    <th className="px-3 py-3.5 text-left text-xs font-semibold text-gray-400 uppercase tracking-wider w-14">Cat</th>
                    <th className="px-4 py-3.5 text-left w-auto">
                      <button onClick={() => handleSort('company')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
                        Company
                        {sortCol === 'company' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />) : <span className="w-3 h-3 inline-block" />}
                      </button>
                    </th>
                    <th className="px-4 py-3.5 text-left w-44">
                      <button onClick={() => handleSort('last_tx')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
                        Last Transaction
                        {sortCol === 'last_tx' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />) : <span className="w-3 h-3 inline-block" />}
                      </button>
                    </th>
                    <th className="px-4 py-3.5 text-left w-36">
                      <button onClick={() => handleSort('limits')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors">
                        Limits
                        {sortCol === 'limits' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />) : <span className="w-3 h-3 inline-block" />}
                      </button>
                    </th>
                    <th className="px-4 py-3.5 text-right w-52">
                      <button onClick={() => handleSort('total')} className="flex items-center gap-1 text-xs font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-600 transition-colors ml-auto">
                        Company Total (AED)
                        {sortCol === 'total' ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-blue-500" /> : <ChevronDown size={12} className="text-blue-500" />) : <span className="w-3 h-3 inline-block" />}
                      </button>
                    </th>
                    {canEdit && <th className="w-20 px-4 py-3.5" />}
                  </tr>
                </thead>
                <tbody>
                  {sortedGroups.length === 0 ? (
                    <tr>
                      <td colSpan={totalCols} className="py-20 text-center text-sm text-gray-300">
                        {catFilter !== 'all' ? `No Category ${catFilter} companies` : 'No companies found'}
                      </td>
                    </tr>
                  ) : (
                    sortedGroups.map((g) => companyGroupRow(g))
                  )}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {depositModal && (
        <DepositModal company={depositModal.company} deposit={depositModal.deposit}
          onClose={() => setDepositModal(null)}
          onSave={async (dto) => {
            if (depositModal.deposit) { await updateCashDeposit(depositModal.deposit.id, dto); }
            else { await createCashDeposit({ company_id: depositModal.company.company_id, bank_account: depositModal.company.bank_account, ...dto }); }
            setDepositModal(null);
            await load();
          }} />
      )}

      {limitsModal && (
        <CompanyLimitsModal company={limitsModal} onClose={() => setLimitsModal(null)}
          onSave={async (dto) => {
            await updateCompanyDepositLimits(limitsModal.company_id, limitsModal.first_bank_account, dto);
            setLimitsModal(null);
            await load();
          }} />
      )}

      {showPlanner && (
        <DepositPlannerModal groups={companyGroups} onClose={() => setShowPlanner(false)} onDepositsAdded={load} />
      )}
    </Layout>
  );
}
