import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ArrowLeft, Search, Upload, FileSpreadsheet, Trash2, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, RotateCcw, Calendar, X } from 'lucide-react';
import { MonthPicker, currentMonthStr } from '../components/MonthPicker';
import { FilterSelect } from '../components/FilterSelect';
import { fmtDate } from '../utils/format';
import {
  getExcelImports, getExcelAllAccounts, getExcelTransactions,
  importExcelBalance, deleteExcelImport, deleteAllExcelData,
  getExcelAccountStats,
} from '../api';
import ClassifySuspenseModal, { ClassifyTarget } from '../components/ClassifySuspenseModal';

// ── Formatting ────────────────────────────────────────────────────────────────

function fmtNum(v: any) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 });
}

// ── Group colour system ───────────────────────────────────────────────────────

type GroupKey = 'A' | 'B' | 'MIXED';

const GROUP: Record<GroupKey, { rowBorder: string; hdrBorder: string; hdrBg: string; badge: string; fileBorder: string; fileIcon: string }> = {
  A: {
    rowBorder: 'border-l-sky-400',
    hdrBorder: 'border-l-sky-500',
    hdrBg:     'bg-sky-50/60',
    badge:     'bg-sky-100 text-sky-700',
    fileBorder:'border-sky-300',
    fileIcon:  'text-sky-500',
  },
  B: {
    rowBorder: 'border-l-violet-400',
    hdrBorder: 'border-l-violet-500',
    hdrBg:     'bg-violet-50/60',
    badge:     'bg-violet-100 text-violet-700',
    fileBorder:'border-violet-300',
    fileIcon:  'text-violet-500',
  },
  MIXED: {
    rowBorder: 'border-l-slate-300',
    hdrBorder: 'border-l-slate-400',
    hdrBg:     'bg-slate-50/60',
    badge:     'bg-slate-100 text-slate-600',
    fileBorder:'border-slate-300',
    fileIcon:  'text-slate-400',
  },
};

// ── Type badges ───────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  INWARD_TRANSFER:   'bg-blue-100 text-blue-700',
  OUTWARD_TRANSFER:  'bg-red-100 text-red-700',
  INTERNAL_TRANSFER: 'bg-gray-100 text-gray-600',
  FX_CONVERSION:     'bg-amber-100 text-amber-700',
  BANK_CHARGE:       'bg-orange-100 text-orange-700',
  VAT_CHARGE:        'bg-orange-100 text-orange-700',
  CASH_DEPOSIT:      'bg-emerald-100 text-emerald-700',
  CHEQUE_PAID:       'bg-slate-100 text-slate-600',
  RETURNED_CHEQUE:   'bg-slate-100 text-slate-600',
  OUTWARD_INTERNATIONAL: 'bg-rose-100 text-rose-700',
  MONTHLY_CHARGE:    'bg-orange-100 text-orange-700',
  SUSPENSE:          'bg-yellow-100 text-yellow-700',
  OPENING_BALANCE:   'bg-gray-100 text-gray-400',
};
const TYPE_LABELS: Record<string, string> = {
  INWARD_TRANSFER: 'Inward', OUTWARD_TRANSFER: 'Outward', INTERNAL_TRANSFER: 'Internal',
  FX_CONVERSION: 'FX', BANK_CHARGE: 'Charge', VAT_CHARGE: 'VAT',
  CASH_DEPOSIT: 'Cash Deposit', CHEQUE_PAID: 'Cheque', RETURNED_CHEQUE: 'Returned',
  OUTWARD_INTERNATIONAL: 'Intl Transfer', MONTHLY_CHARGE: 'Monthly Fee',
  SUSPENSE: 'Suspense', OPENING_BALANCE: 'Opening',
};

function parseParticular(particular: string | null | undefined): { name: string; subtext: string | null } {
  if (!particular) return { name: '—', subtext: null };
  const prefixes = [
    'TT TRF TO ', 'TT TRF FROM ', 'TRF TO ', 'TRF FROM ',
    'OAT-', 'CASH-', 'CHQ-', 'RTGS-', 'NEFT-', 'IMPS-',
    'SALARY ', 'SALARY-', 'INT ON ', 'COMM ON ', 'TRANSFER TO ',
    'TRANSFER FROM ', 'ONLINE TRF TO ', 'ONLINE TRF FROM ',
    'STANDING ORDER TO ', 'STANDING ORDER FROM ',
    'FUND RECD FROM ', 'FUNDS RECD FROM ',
    'FUND RECEIVED FROM ', 'FUNDS RECEIVED FROM ',
    'FUND RECV FROM ', 'FUNDS RECV FROM ',
    'REMITTANCE FROM ', 'REMITTANCE TO ',
    'RECEIVED FROM ', 'RECEIPT FROM ',
    'PAYMENT FROM ', 'PAYMENT TO ',
    'PYMT FROM ', 'PYMT TO ',
    'PMT FROM ', 'PMT TO ',
    'WIRE FROM ', 'WIRE TO ',
    'SWIFT FROM ', 'SWIFT TO ',
    'INWARD FROM ', 'OUTWARD TO ',
    'SENT TO ', 'RECD FROM ', 'REC FROM ',
    'CREDIT FROM ', 'DEBIT TO ',
  ];
  const upper = particular.toUpperCase();
  for (const p of prefixes) {
    if (upper.startsWith(p)) {
      const name = particular.slice(p.length).trim();
      return name ? { name, subtext: particular } : { name: particular, subtext: null };
    }
  }
  return { name: particular, subtext: null };
}

function TypeBadge({ type }: { type: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium leading-none ${TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

const STATUS_COLORS: Record<string, string> = {
  blocked: 'bg-red-100 text-red-700',
  disabled: 'bg-gray-100 text-gray-500',
  closed: 'bg-gray-100 text-gray-400',
  'kyc issue': 'bg-orange-100 text-orange-700',
  'online issue': 'bg-yellow-100 text-yellow-700',
};

function RemarksBadge({ remarks }: { remarks: string }) {
  const lower = remarks.toLowerCase();
  const color = Object.entries(STATUS_COLORS).find(([k]) => lower.includes(k))?.[1] ?? 'bg-gray-100 text-gray-500';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium leading-none ${color}`}>
      {remarks}
    </span>
  );
}

// ── Circular upload progress ─────────────────────────────────────────────────

function CircularProgress({ pct }: { pct: number }) {
  const size = 80;
  const sw = 6;
  const r = (size - sw) / 2;
  const circ = 2 * Math.PI * r;
  const processing = pct >= 100;
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}
        className={processing ? 'animate-spin' : '-rotate-90'}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#2563eb" strokeWidth={sw}
          strokeLinecap="round"
          strokeDasharray={processing ? `${circ * 0.28} ${circ * 0.72}` : `${(pct / 100) * circ} ${circ}`}
          style={{ transition: processing ? 'none' : 'stroke-dasharray 0.15s ease' }}
        />
      </svg>
      {!processing && (
        <span className="absolute text-[11px] font-semibold text-gray-700 tabular-nums">{pct}%</span>
      )}
    </div>
  );
}

// ── Upload zone ───────────────────────────────────────────────────────────────

function UploadZone({ onFiles, compact = false }: { onFiles: (files: File[]) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [dragNames, setDragNames] = useState<string[]>([]);

  const handle = (list: FileList | null) => {
    if (!list) return;
    const valid = Array.from(list).filter(f => f.name.endsWith('.xlsx') || f.name.endsWith('.xls'));
    if (valid.length) onFiles(valid);
  };

  if (compact) {
    return (
      <>
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
          <Upload size={14} className="mr-1.5" /> Import files
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => { handle(e.target.files); e.target.value = ''; }} />
      </>
    );
  }

  return (
    <div className="p-8 flex items-center justify-center min-h-[60vh]">
      <div
        className={`w-full max-w-lg border-2 border-dashed rounded-2xl p-12 text-center transition-colors cursor-pointer
          ${dragging ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
        onDragOver={e => {
          e.preventDefault(); setDragging(true);
          setDragNames(Array.from(e.dataTransfer.items).map((_, i) => e.dataTransfer.items[i].getAsFile()?.name ?? '').filter(Boolean));
        }}
        onDragLeave={() => { setDragging(false); setDragNames([]); }}
        onDrop={e => { e.preventDefault(); setDragging(false); setDragNames([]); handle(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
      >
        <FileSpreadsheet size={40} className="mx-auto mb-4 text-gray-400" />
        {dragging && dragNames.length > 0 ? (
          <div className="mb-5">
            {dragNames.map(n => (
              <p key={n} className="text-sm font-medium text-blue-700 truncate">{n}</p>
            ))}
          </div>
        ) : (
          <>
            <p className="font-semibold text-gray-700 mb-1">Drop your Excel balance files here</p>
            <p className="text-sm text-gray-400 mb-5">Group A and/or Group B — you can drop both at once</p>
          </>
        )}
        <Button variant="secondary" size="sm" onClick={e => { e.stopPropagation(); inputRef.current?.click(); }}>
          <Upload size={14} className="mr-1.5" /> Choose files
        </Button>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" multiple className="hidden"
          onChange={e => { handle(e.target.files); e.target.value = ''; }} />
      </div>
    </div>
  );
}

// ── Imported files strip ──────────────────────────────────────────────────────

function ImportedFilesStrip({ imports, onDelete }: { imports: any[]; onDelete: (id: number) => void }) {
  const [expanded, setExpanded] = useState(true);
  if (imports.length === 0) return null;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-gray-50 transition-colors"
        onClick={() => setExpanded(v => !v)}
      >
        <div className="flex items-center gap-2.5">
          <FileSpreadsheet size={14} className="text-gray-400" />
          <span className="text-sm font-medium text-gray-700">Imported files</span>
          <span className="text-xs font-mono text-gray-400 bg-gray-100 rounded px-1.5 py-0.5">{imports.length}</span>
        </div>
        <ChevronDown size={14} className={`text-gray-400 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-gray-100">
          {imports.map((imp, i) => {
            const g = (imp.group as GroupKey) in GROUP ? (imp.group as GroupKey) : 'MIXED';
            const gs = GROUP[g];
            return (
              <div key={imp.id} className={`flex items-center gap-3 px-5 py-3 border-l-4 ${gs.fileBorder} ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                <FileSpreadsheet size={14} className={gs.fileIcon} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate leading-tight">{imp.filename}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{imp.account_count} accounts · {fmtDate(imp.imported_at)}</p>
                </div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold ${gs.badge}`}>
                  Group {imp.group}
                </span>
                <button
                  onClick={() => onDelete(imp.id)}
                  className="text-gray-300 hover:text-red-500 transition-colors p-1 rounded shrink-0"
                  title="Delete import"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Grouping helper ───────────────────────────────────────────────────────────

interface CompanyGroup {
  company: string;
  rows: any[];
  countA: number;
  countB: number;
  primaryGroup: GroupKey;
}

function groupByCompany(accounts: any[]): CompanyGroup[] {
  const groups: CompanyGroup[] = [];
  const index = new Map<string, CompanyGroup>();
  for (const acc of accounts) {
    const key = acc.company_name ?? '';
    if (!index.has(key)) {
      const g: CompanyGroup = { company: key, rows: [], countA: 0, countB: 0, primaryGroup: 'A' };
      index.set(key, g);
      groups.push(g);
    }
    const g = index.get(key)!;
    g.rows.push(acc);
    if (acc.import_group === 'A') g.countA++;
    else if (acc.import_group === 'B') g.countB++;
  }
  for (const g of groups) {
    g.primaryGroup = g.countA > 0 && g.countB > 0 ? 'MIXED' : g.countB > 0 ? 'B' : 'A';
  }
  return groups;
}

// ── Account list ──────────────────────────────────────────────────────────────

function AccountListView({ accounts, imports, onSelect, onUpload, onDelete, uploading, uploadProgress, fromMonth, toMonth, onFromMonthChange, onToMonthChange }: {
  accounts: any[];
  imports: any[];
  onSelect: (a: any) => void;
  onUpload: (files: File[]) => void;
  onDelete: (id: number) => void;
  uploading: boolean;
  uploadProgress: number | null;
  fromMonth: string;
  toMonth: string;
  onFromMonthChange: (v: string) => void;
  onToMonthChange: (v: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<'ALL' | 'A' | 'B'>('ALL');
  const [bankFilter, setBankFilter] = useState('');
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [grouped, setGrouped] = useState(true);

  const normBank = (name: string) =>
    (name ?? '').toUpperCase().trim().replace(/\s+(AED|USD|EUR|GBP|EURO)$/, '');

  const uniqueBanks = useMemo(() => {
    const seen = new Set<string>();
    const result: string[] = [];
    accounts.forEach(a => {
      const key = normBank(a.bank_name ?? '');
      if (key && !seen.has(key)) { seen.add(key); result.push(key); }
    });
    return result.sort();
  }, [accounts]);

  const [accountStats, setAccountStats] = useState<Record<number, { transaction_count: number; closing_balance: number | null }>>({});

  useEffect(() => {
    if (!fromMonth || !toMonth) { setAccountStats({}); return; }
    const from = fromMonth + '-01';
    const [y, m] = toMonth.split('-').map(Number);
    const to = `${toMonth}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
    getExcelAccountStats(from, to).then(res => {
      const map: Record<number, any> = {};
      (res.data as any[]).forEach(row => { map[row.account_id] = row; });
      setAccountStats(map);
    });
  }, [fromMonth, toMonth]);

  const statOf = (a: any) => accountStats[a.id];

  const handleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };
  const handleReset = () => {
    setSortCol(null); setSortDir('desc'); setGroupFilter('ALL'); setBankFilter(''); setSearch(''); setGrouped(true);
    onFromMonthChange(''); onToMonthChange('');
  };
  const isFiltered = !!sortCol || groupFilter !== 'ALL' || !!bankFilter || !!search.trim() || !grouped || !!fromMonth || !!toMonth;

  let filtered = search.trim()
    ? accounts.filter(a =>
        (a.company_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (a.bank_name ?? '').toLowerCase().includes(search.toLowerCase()))
    : [...accounts];

  if (groupFilter !== 'ALL') filtered = filtered.filter(a => a.import_group === groupFilter);
  if (bankFilter) filtered = filtered.filter(a => normBank(a.bank_name ?? '') === bankFilter);

  if (sortCol) {
    filtered = [...filtered].sort((a, b) => {
      const va = sortCol === 'balance' ? Number(a.closing_balance ?? 0) :
                 sortCol === 'txns' ? Number(a.transaction_count ?? 0) : '';
      const vb = sortCol === 'balance' ? Number(b.closing_balance ?? 0) :
                 sortCol === 'txns' ? Number(b.transaction_count ?? 0) : '';
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }

  const groups = groupByCompany(filtered);
  const activeCount = accounts.filter(a => Number(a.closing_balance) > 0).length;
  const flaggedCount = accounts.filter(a => a.remarks).length;

  return (
    <>
      <PageHeader
        title="Transactions"
        subtitle="All imported Group A / Group B account ledgers"
        action={uploading
          ? (
            <div className="flex items-center gap-2.5">
              <CircularProgress pct={uploadProgress ?? 0} />
              <span className="text-xs text-gray-500">
                {(uploadProgress ?? 0) >= 100 ? 'Processing…' : `${uploadProgress ?? 0}%`}
              </span>
            </div>
          )
          : <UploadZone onFiles={onUpload} compact />}
      />
      <div className="p-8 space-y-4">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total accounts', value: accounts.length },
            { label: 'Active accounts', value: activeCount },
            { label: 'Flagged accounts', value: flaggedCount },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white px-6 py-4">
              <p className="text-2xl font-bold text-gray-900 font-mono">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        {/* Imported files */}
        <ImportedFilesStrip imports={imports} onDelete={onDelete} />

        {/* Accounts table */}
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-3">
              <p className="font-medium text-gray-900 text-sm shrink-0">
                Accounts
                <span className="ml-1.5 text-gray-400 font-normal">
                  {filtered.length}{filtered.length !== accounts.length ? ` of ${accounts.length}` : ''}
                </span>
              </p>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                {/* Grouped / Flat toggle */}
                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                  <button
                    onClick={() => setGrouped(true)}
                    className={`px-3 py-1.5 transition-colors ${grouped ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >Grouped</button>
                  <button
                    onClick={() => setGrouped(false)}
                    className={`px-3 py-1.5 transition-colors ${!grouped ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                  >Flat</button>
                </div>
                {/* Group filter */}
                <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden text-xs font-medium">
                  {(['ALL', 'A', 'B'] as const).map(g => (
                    <button
                      key={g}
                      onClick={() => setGroupFilter(g)}
                      className={`px-3 py-1.5 transition-colors ${groupFilter === g ? 'bg-gray-800 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
                    >
                      {g === 'ALL' ? 'All' : `Group ${g}`}
                    </button>
                  ))}
                </div>
                {/* Bank filter */}
                <FilterSelect
                  value={bankFilter}
                  onChange={setBankFilter}
                  placeholder="All banks"
                  options={uniqueBanks.map(b => ({ label: b, value: b }))}
                />
                {/* Search */}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search company…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
                  />
                </div>
                {/* Date range filter */}
                {fromMonth ? (
                  <div className="flex items-center gap-1.5 border border-gray-200 rounded-lg px-2 py-1 bg-white">
                    <Calendar size={12} className="text-gray-400 shrink-0" />
                    <MonthPicker
                      value={fromMonth}
                      onChange={v => { onFromMonthChange(v); if (toMonth && v > toMonth) onToMonthChange(v); }}
                    />
                    <span className="text-gray-300 text-xs">→</span>
                    <MonthPicker value={toMonth} onChange={onToMonthChange} minMonth={fromMonth} />
                    <button onClick={() => { onFromMonthChange(''); onToMonthChange(''); }} className="ml-1 text-gray-400 hover:text-gray-600">
                      <X size={12} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => { const m = currentMonthStr(); onFromMonthChange(m); onToMonthChange(m); }}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <Calendar size={12} /> Month
                  </button>
                )}
                {/* Default reset */}
                {isFiltered && (
                  <button
                    onClick={handleReset}
                    title="Reset all filters and sorting"
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <RotateCcw size={11} /> Default
                  </button>
                )}
              </div>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left">
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Bank</th>
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Curr</th>
                  <SortTh col="balance" label="Balance" align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <SortTh col="txns"    label="Txns"    align="right" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                  <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody>
                {grouped
                  ? groups.map(({ company, rows, countA, countB, primaryGroup }) => {
                      const gs = GROUP[primaryGroup];
                      const multi = rows.length > 1;
                      return (
                        <>
                          <tr key={`hdr-${company}`} className={`border-t border-gray-200 border-l-4 ${gs.hdrBorder} ${gs.hdrBg}`}>
                            <td colSpan={5} className="px-5 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[12px] font-semibold text-gray-700 tracking-wide">{company || '—'}</span>
                                {multi && <span className="text-[11px] text-gray-400">{rows.length} accounts</span>}
                                <div className="flex items-center gap-1 ml-auto">
                                  {countA > 0 && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-sky-100 text-sky-700">A{multi ? ` ×${countA}` : ''}</span>}
                                  {countB > 0 && <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">B{multi ? ` ×${countB}` : ''}</span>}
                                </div>
                              </div>
                            </td>
                          </tr>
                          {rows.map(a => {
                            const rowGs = GROUP[(a.import_group as GroupKey) in GROUP ? (a.import_group as GroupKey) : 'MIXED'];
                            const s = statOf(a);
                            const rawBal = s ? s.closing_balance : a.closing_balance;
                            const bal = rawBal != null ? Number(rawBal) : null;
                            const txns = s ? s.transaction_count : a.transaction_count;
                            return (
                              <tr key={a.id} onClick={() => onSelect(a)} className={`border-t border-gray-100 border-l-4 ${rowGs.rowBorder} hover:bg-gray-50/80 cursor-pointer transition-colors`}>
                                <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{a.bank_name}</td>
                                <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{a.currency || '—'}</td>
                                <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                                  <span className={bal == null ? 'text-gray-300' : bal < 0 ? 'text-red-600 font-semibold' : bal === 0 ? 'text-gray-400' : 'text-gray-900 font-medium'}>
                                    {bal != null ? fmtNum(bal) : '—'}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400">{txns}</td>
                                <td className="px-4 py-2.5">{a.remarks ? <RemarksBadge remarks={a.remarks} /> : null}</td>
                              </tr>
                            );
                          })}
                        </>
                      );
                    })
                  : filtered.map(a => {
                      const rowGs = GROUP[(a.import_group as GroupKey) in GROUP ? (a.import_group as GroupKey) : 'MIXED'];
                      const s = statOf(a);
                      const rawBal = s ? s.closing_balance : a.closing_balance;
                      const bal = rawBal != null ? Number(rawBal) : null;
                      const txns = s ? s.transaction_count : a.transaction_count;
                      return (
                        <tr key={a.id} onClick={() => onSelect(a)} className={`border-t border-gray-100 border-l-4 ${rowGs.rowBorder} hover:bg-gray-50/80 cursor-pointer transition-colors`}>
                          <td className="px-4 py-2.5 whitespace-nowrap">
                            <p className="font-medium text-gray-800">{a.bank_name}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{a.company_name || '—'}</p>
                          </td>
                          <td className="px-4 py-2.5 font-mono text-xs text-gray-400">{a.currency || '—'}</td>
                          <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                            <span className={bal == null ? 'text-gray-300' : bal < 0 ? 'text-red-600 font-semibold' : bal === 0 ? 'text-gray-400' : 'text-gray-900 font-medium'}>
                              {bal != null ? fmtNum(bal) : '—'}
                            </span>
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono text-xs text-gray-400">{txns}</td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {a.import_group && (
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold ${a.import_group === 'A' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'}`}>
                                  {a.import_group}
                                </span>
                              )}
                              {a.remarks ? <RemarksBadge remarks={a.remarks} /> : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                }

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-gray-400 text-sm">
                      {search ? `No accounts matching "${search}"` : 'No accounts imported yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}

// ── Sort header helper ────────────────────────────────────────────────────────

type SortDir = 'asc' | 'desc';

function SortTh({ col, label, align = 'left', sortCol, sortDir, onSort }: {
  col: string; label: string; align?: 'left' | 'right';
  sortCol: string | null; sortDir: SortDir; onSort: (c: string) => void;
}) {
  const active = sortCol === col;
  const Icon = active ? (sortDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      className={`px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide cursor-pointer select-none hover:text-gray-600 transition-colors whitespace-nowrap ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => onSort(col)}
    >
      <span className={`inline-flex items-center gap-1 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
        {label}
        <Icon size={11} className={active ? 'text-blue-500' : 'text-gray-300'} />
      </span>
    </th>
  );
}

// ── Account detail ────────────────────────────────────────────────────────────

function AccountDetailView({ account, transactions, onBack, onReload, fromMonth, toMonth }: {
  account: any; transactions: any[]; onBack: () => void; onReload: () => void;
  fromMonth: string; toMonth: string;
}) {
  const [search, setSearch] = useState('');
  const [classifyTx, setClassifyTx] = useState<ClassifyTarget | null>(null);
  const nonOpening = transactions.filter(t => !t.is_opening_balance);
  const dateFiltered = (fromMonth || toMonth)
    ? nonOpening.filter(t => {
        const ym = (t.date ?? '').slice(0, 7);
        if (fromMonth && ym < fromMonth) return false;
        if (toMonth && ym > toMonth) return false;
        return true;
      })
    : nonOpening;
  const displayed = search.trim()
    ? dateFiltered.filter(t => (t.particular ?? '').toLowerCase().includes(search.toLowerCase()))
    : dateFiltered;
  const suspenseCount = dateFiltered.filter(t => t.transaction_type === 'SUSPENSE').length;

  // Balance as of end of selected period (or last known if no txns in period)
  const periodEndBalance = (() => {
    if (!toMonth) return account.closing_balance;
    const toDate = toMonth + '-31';
    // transactions are sorted newest-first (sheet_row_index DESC from backend)
    const last = nonOpening.find(t => t.date && t.date <= toDate);
    return last != null ? last.balance : account.closing_balance;
  })();

  const g = (account.import_group as GroupKey) in GROUP ? (account.import_group as GroupKey) : 'MIXED';
  const gs = GROUP[g];

  return (
    <>
      <PageHeader
        title={account.company_name}
        subtitle={`${account.bank_name}${account.currency ? ` · ${account.currency}` : ''}${account.account_code ? ` · ${account.account_code}` : ''}`}
        action={
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold ${gs.badge}`}>
              Group {account.import_group}
            </span>
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft size={14} className="mr-1" /> Back
            </Button>
          </div>
        }
      />
      <div className="p-8 space-y-6">
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-4">
            <p className="text-2xl font-bold text-gray-900 font-mono">{dateFiltered.length.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {(fromMonth || toMonth) && dateFiltered.length !== nonOpening.length
                ? `Transactions in period (of ${nonOpening.length})`
                : 'Total transactions'}
            </p>
          </div>
          <div className={`rounded-xl border px-6 py-4 ${suspenseCount > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
            <p className={`text-2xl font-bold font-mono ${suspenseCount > 0 ? 'text-yellow-700' : 'text-gray-900'}`}>{suspenseCount}</p>
            <p className={`text-xs mt-0.5 ${suspenseCount > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>Suspense</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-4">
            <p className={`text-2xl font-bold font-mono ${periodEndBalance != null && Number(periodEndBalance) < 0 ? 'text-red-600' : 'text-gray-900'}`}>
              {periodEndBalance != null ? fmtNum(periodEndBalance) : '—'}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {toMonth ? `Balance at end of ${toMonth}` : `Closing balance`} ({account.currency || 'AED'})
            </p>
          </div>
        </div>

        {account.remarks && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-orange-50 border border-orange-200 text-sm text-orange-800">
            <RemarksBadge remarks={account.remarks} />
            <span>This account has a status remark in the summary sheet.</span>
          </div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-medium text-gray-900 text-sm">
                  Transactions ({displayed.length}{displayed.length !== nonOpening.length ? ` of ${nonOpening.length}` : ''})
                </p>
                {(fromMonth || toMonth) && (
                  <p className="text-xs text-blue-500 mt-0.5">
                    {fromMonth && toMonth && fromMonth !== toMonth
                      ? `Filtered: ${fromMonth} → ${toMonth}`
                      : `Filtered: ${fromMonth || toMonth}`}
                  </p>
                )}
              </div>
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input type="text" placeholder="Search particulars…" value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="border border-gray-200 rounded-lg pl-8 pr-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors" />
              </div>
            </div>
          </CardHeader>
          <div className={`border-l-4 ${gs.rowBorder}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200 text-left">
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide whitespace-nowrap">Date</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide">Particulars</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide text-right">Withdrawal</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide text-right">Deposit</th>
                    <th className="px-4 py-2.5 text-xs font-medium text-gray-400 uppercase tracking-wide text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {displayed.map(tx => (
                    <tr key={tx.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-2.5 text-gray-500 text-sm whitespace-nowrap">{tx.date ? fmtDate(tx.date) : '—'}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1 min-w-0 items-start">
                          {tx.transaction_type === 'SUSPENSE' ? (
                            <button
                              onClick={() => setClassifyTx({
                                id: tx.id, source: 'excel',
                                description: tx.particular, date: tx.date,
                                debit: tx.withdrawal, credit: tx.deposit,
                              })}
                              title="Unclassified — click to name and categorise"
                              className="cursor-pointer hover:ring-2 hover:ring-yellow-300 rounded transition-shadow"
                            >
                              <TypeBadge type="SUSPENSE" />
                            </button>
                          ) : (
                            <TypeBadge type={tx.transaction_type} />
                          )}
                          {(() => {
                            const isPlain = tx.transaction_type === 'BANK_CHARGE' || tx.transaction_type === 'CASH_DEPOSIT';
                            if (isPlain) {
                              return <span className="text-gray-600 text-sm leading-tight">{tx.custom_label || tx.particular || '—'}</span>;
                            }
                            const parsed = parseParticular(tx.particular);
                            const displayName = tx.custom_label || parsed.name;
                            const subtext = tx.custom_label ? tx.particular : parsed.subtext;
                            return (
                              <>
                                <span className="font-semibold text-gray-900 text-sm leading-tight">{displayName}</span>
                                {subtext && <span className="text-xs text-gray-400 leading-snug">{subtext}</span>}
                              </>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                        {tx.withdrawal != null ? <span className="font-semibold text-red-600">{fmtNum(tx.withdrawal)}</span> : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono whitespace-nowrap">
                        {tx.deposit != null ? <span className="font-semibold text-emerald-600">{fmtNum(tx.deposit)}</span> : ''}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-gray-700 whitespace-nowrap">
                        <span className={Number(tx.balance) < 0 ? 'text-red-600 font-semibold' : ''}>{fmtNum(tx.balance)}</span>
                      </td>
                    </tr>
                  ))}
                  {displayed.length === 0 && (
                    <tr><td colSpan={5} className="px-6 py-10 text-center text-gray-400 text-sm">
                      {search ? `No transactions matching "${search}"` : 'No transactions'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Card>
      </div>

      {classifyTx && (
        <ClassifySuspenseModal
          tx={classifyTx}
          onClose={() => setClassifyTx(null)}
          onSaved={() => { setClassifyTx(null); onReload(); }}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ExcelBalance() {
  const [searchParams] = useSearchParams();
  const [imports, setImports] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccount, setSelectedAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [txLoading, setTxLoading] = useState(false);

  const loadAll = useCallback(async () => {
    const [impRes, accRes] = await Promise.all([getExcelImports(), getExcelAllAccounts()]);
    setImports(impRes.data);
    setAccounts(accRes.data);
    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const handleUpload = useCallback(async (files: File[]) => {
    setUploading(true);
    const progresses = new Array(files.length).fill(0);
    setUploadProgress(0);
    try {
      await Promise.all(files.map((f, i) =>
        importExcelBalance(f, pct => {
          progresses[i] = pct;
          const avg = Math.round(progresses.reduce((a, b) => a + b, 0) / files.length);
          setUploadProgress(avg);
        })
      ));
      setUploadProgress(100); // bytes sent; server still processing
      await loadAll();
      setSelectedAccount(null);
      setTransactions([]);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  }, [loadAll]);

  const [fromMonth, setFromMonth] = useState('');
  const [toMonth, setToMonth] = useState('');

  const [showNuke, setShowNuke] = useState(false);
  const [nukeCode, setNukeCode] = useState('');
  const [nukeError, setNukeError] = useState('');
  const [nuking, setNuking] = useState(false);

  const handleNuke = async () => {
    if (nukeCode !== '111') { setNukeError('Wrong code'); return; }
    setNuking(true);
    try {
      await deleteAllExcelData();
      setShowNuke(false);
      setNukeCode('');
      setSelectedAccount(null);
      setTransactions([]);
      await loadAll();
    } catch { setNukeError('Failed to delete'); }
    finally { setNuking(false); }
  };

  const handleDeleteImport = useCallback(async (id: number) => {
    await deleteExcelImport(id);
    if (selectedAccount?.import_id === id) {
      setSelectedAccount(null);
      setTransactions([]);
    }
    await loadAll();
  }, [loadAll, selectedAccount]);

  const handleSelectAccount = useCallback(async (account: any) => {
    setSelectedAccount(account);
    setTransactions([]);
    setTxLoading(true);
    try {
      const res = await getExcelTransactions(account.id);
      setTransactions(res.data);
    } finally {
      setTxLoading(false);
    }
  }, []);

  // Auto-open account when navigated here with ?accountId=X (e.g. from AccountsList drill-down)
  const autoOpenDone = useRef(false);
  useEffect(() => {
    if (autoOpenDone.current || loading) return;
    const id = searchParams.get('accountId');
    if (!id) return;
    const acc = accounts.find(a => String(a.id) === id);
    if (acc) { autoOpenDone.current = true; handleSelectAccount(acc); }
  }, [loading, accounts, searchParams, handleSelectAccount]);

  // Silent refresh (no loading flash) — used after classifying a suspense entry
  const reloadTransactions = useCallback(async () => {
    if (!selectedAccount) return;
    const res = await getExcelTransactions(selectedAccount.id);
    setTransactions(res.data);
  }, [selectedAccount]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-screen">
          <p className="text-gray-400 text-sm">Loading…</p>
        </div>
      </Layout>
    );
  }

  if (accounts.length === 0) {
    return (
      <Layout>
        <PageHeader title="Transactions" subtitle="View Group A / Group B account ledgers" />
        {uploading
          ? (
            <div className="flex flex-col items-center justify-center gap-3 min-h-[60vh]">
              <CircularProgress pct={uploadProgress ?? 0} />
              <p className="text-sm text-gray-500">
                {(uploadProgress ?? 0) >= 100 ? 'Processing…' : 'Uploading…'}
              </p>
            </div>
          )
          : <UploadZone onFiles={handleUpload} />}
      </Layout>
    );
  }

  if (selectedAccount) {
    return (
      <Layout>
        {txLoading
          ? <div className="flex items-center justify-center min-h-screen"><p className="text-gray-400 text-sm">Loading transactions…</p></div>
          : <AccountDetailView account={selectedAccount} transactions={transactions}
              onReload={reloadTransactions}
              fromMonth={fromMonth} toMonth={toMonth}
              onBack={() => { setSelectedAccount(null); setTransactions([]); }} />}
      </Layout>
    );
  }

  return (
    <Layout>
      <AccountListView
        accounts={accounts}
        imports={imports}
        onSelect={handleSelectAccount}
        onUpload={handleUpload}
        onDelete={handleDeleteImport}
        uploading={uploading}
        uploadProgress={uploadProgress}
        fromMonth={fromMonth}
        toMonth={toMonth}
        onFromMonthChange={setFromMonth}
        onToMonthChange={setToMonth}
      />
      <div className="px-8 pb-8 flex justify-end">
        <button
          onClick={() => { setShowNuke(true); setNukeCode(''); setNukeError(''); }}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors"
        >
          <Trash2 size={12} /> Delete all Excel data
        </button>
      </div>

      {showNuke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <p className="font-semibold text-gray-900 text-sm">Delete all Excel data?</p>
            <p className="text-xs text-gray-500">This removes all imported accounts and transactions. Enter code to confirm.</p>
            <input
              autoFocus
              type="password"
              value={nukeCode}
              onChange={e => { setNukeCode(e.target.value); setNukeError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleNuke()}
              placeholder="Code"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            {nukeError && <p className="text-xs text-red-600">{nukeError}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={handleNuke} disabled={nuking}
                className="bg-red-600 hover:bg-red-700 text-white">
                {nuking ? 'Deleting…' : 'Delete all'}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowNuke(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
