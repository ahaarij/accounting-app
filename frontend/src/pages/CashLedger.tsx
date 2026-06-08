import { useEffect, useState, useMemo, useRef } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../auth/AuthContext';
import { getCashEntries, createCashEntry, updateCashEntry, deleteCashEntry, deleteCashflowRow, clearAllCashflow, getCashflowSummary } from '../api';
import { fmtDate } from '../utils/format';
import { Plus, Pencil, Trash2 } from 'lucide-react';

function AmountInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const holdRef = useRef<{ timeout: ReturnType<typeof setTimeout> | null; interval: ReturnType<typeof setInterval> | null; elapsed: number }>({ timeout: null, interval: null, elapsed: 0 });
  const valueRef = useRef(value);
  valueRef.current = value;

  const nudge = (dir: 1 | -1, amount = 1) => {
    const cur = parseFloat(valueRef.current) || 0;
    const next = Math.round((cur + dir * amount) * 100) / 100;
    onChange(String(Math.max(0, next)));
  };

  const stopHold = () => {
    if (holdRef.current.timeout) clearTimeout(holdRef.current.timeout);
    if (holdRef.current.interval) clearInterval(holdRef.current.interval);
    holdRef.current = { timeout: null, interval: null, elapsed: 0 };
  };

  const startHold = (dir: 1 | -1) => {
    nudge(dir, 1);
    holdRef.current.elapsed = 0;
    holdRef.current.timeout = setTimeout(() => {
      holdRef.current.interval = setInterval(() => {
        holdRef.current.elapsed += 80;
        const amount = holdRef.current.elapsed > 2000 ? 100 : holdRef.current.elapsed > 800 ? 10 : 1;
        nudge(dir, amount);
      }, 80);
    }, 350);
  };

  return (
    <div className="flex items-center border border-gray-300 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-blue-500">
      <button type="button"
        onMouseDown={() => startHold(-1)} onMouseUp={stopHold} onMouseLeave={stopHold}
        className="px-2.5 py-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 select-none font-medium text-base leading-none">
        −
      </button>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder ?? '0.00'}
        className="flex-1 min-w-0 px-1 py-1.5 text-sm text-center focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button type="button"
        onMouseDown={() => startHold(1)} onMouseUp={stopHold} onMouseLeave={stopHold}
        className="px-2.5 py-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 select-none font-medium text-base leading-none">
        +
      </button>
    </div>
  );
}

const CURRENCIES = ['AED', 'USD'];

function fmtNum(v: any) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 });
}

const emptyForm = { date: '', description: '', cash_in: '', cash_out: '', balance: '', notes: '', currency: 'AED' };

export default function CashLedger() {
  const { canEdit } = useAuth();
  const canWrite = canEdit;

  const [tab, setTab] = useState<'manual' | 'cashflow' | 'both'>('manual');
  const [currency, setCurrency] = useState('AED');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Manual entries
  const [entries, setEntries] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Cashflow
  const [cashflow, setCashflow] = useState<any[]>([]);
  const [cfLoading, setCfLoading] = useState(false);
  const [cfDeleteId, setCfDeleteId] = useState<number | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const loadEntries = async () => {
    setLoading(true);
    try {
      const res = await getCashEntries(currency || undefined, startDate || undefined, endDate || undefined);
      setEntries(res.data);
    } finally { setLoading(false); }
  };

  const loadCashflow = async () => {
    setCfLoading(true);
    try {
      const res = await getCashflowSummary(startDate || undefined, endDate || undefined);
      setCashflow(res.data.cashflow);
    } finally { setCfLoading(false); }
  };

  useEffect(() => {
    if (tab === 'manual') loadEntries();
    else if (tab === 'cashflow') loadCashflow();
    else { loadEntries(); loadCashflow(); }
  }, [tab, currency, startDate, endDate]);

  // Running balance totals
  const totals = useMemo(() => {
    const totalIn  = entries.reduce((s, e) => s + Number(e.cash_in  ?? 0), 0);
    const totalOut = entries.reduce((s, e) => s + Number(e.cash_out ?? 0), 0);
    return { totalIn, totalOut, net: totalIn - totalOut };
  }, [entries]);

  const openAdd = () => { setEditId(null); setForm({ ...emptyForm, currency }); setFormError(''); setShowForm(true); };
  const openEdit = (e: any) => {
    setEditId(e.id);
    setForm({ date: e.date, description: e.description ?? '', cash_in: e.cash_in ?? '', cash_out: e.cash_out ?? '', balance: e.balance ?? '', notes: e.notes ?? '', currency: e.currency });
    setFormError(''); setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.date) { setFormError('Date is required'); return; }
    setSaving(true); setFormError('');
    try {
      const dto = {
        date: form.date,
        description: form.description || undefined,
        cash_in:  form.cash_in  !== '' ? Number(form.cash_in)  : undefined,
        cash_out: form.cash_out !== '' ? Number(form.cash_out) : undefined,
        balance:  form.balance  !== '' ? Number(form.balance)  : undefined,
        notes:    form.notes || undefined,
        currency: form.currency,
      };
      if (editId) await updateCashEntry(editId, dto);
      else await createCashEntry(dto);
      setShowForm(false); loadEntries();
    } catch (e: any) {
      setFormError(e?.response?.data?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteCashEntry(id); loadEntries(); } finally { setDeleteId(null); }
  };

  const handleDeleteCfRow = async (id: number) => {
    try { await deleteCashflowRow(id); loadCashflow(); } finally { setCfDeleteId(null); }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try { await clearAllCashflow(); setCashflow([]); } finally { setClearing(false); setClearConfirm(false); }
  };

  // Combined view: merge manual entries + cashflow rows, sorted by date then id
  const combined = useMemo(() => {
    const manual = entries.map(e => ({
      _key: `m-${e.id}`, _type: 'manual' as const, _id: e.id,
      date: e.date, description: e.description,
      cash_in: e.cash_in != null ? Number(e.cash_in) : null,
      cash_out: e.cash_out != null ? Number(e.cash_out) : null,
      currency: e.currency, notes: e.notes,
    }));
    const imports = cashflow.map(r => {
      const inward = /receiv|inward/i.test(r.transaction_group ?? '');
      return {
        _key: `c-${r.id}`, _type: 'import' as const, _id: r.id,
        date: r.date, description: r.transaction_group,
        cash_in:  inward ? Number(r.amount_aed ?? 0) || null : null,
        cash_out: !inward ? Number(r.amount_aed ?? 0) || null : null,
        currency: r.amount_usd != null ? 'USD' : 'AED', notes: null,
      };
    });
    return [...manual, ...imports].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  }, [entries, cashflow]);

  // Group cashflow by date
  const cfByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const r of cashflow) {
      const d = r.date; if (!map.has(d)) map.set(d, []); map.get(d)!.push(r);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [cashflow]);

  return (
    <Layout>
      <PageHeader title="Cash Ledger" subtitle="Manual cash transactions and cashflow import data" />
      <div className="p-8 space-y-6">

        {/* Controls */}
        <div className="flex items-center gap-3 flex-wrap bg-white border border-gray-200 rounded-xl px-5 py-3">
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
            {([['manual', 'Manual Entries'], ['cashflow', 'From Cashflow Sheet'], ['both', 'Combined']] as const).map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${tab === t ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                {label}
              </button>
            ))}
          </div>
          {tab === 'manual' && (
            <select value={currency} onChange={e => setCurrency(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">All currencies</option>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
          )}
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {(startDate || endDate) && <button onClick={() => { setStartDate(''); setEndDate(''); }} className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>}
          {tab === 'manual' && canWrite && (
            <Button variant="secondary" size="sm" onClick={openAdd} className="ml-auto">
              <Plus size={13} className="mr-1" /> Add Entry
            </Button>
          )}
        </div>

        {/* ── MANUAL ENTRIES TAB ── */}
        {tab === 'manual' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 text-sm">Cash Transactions ({entries.length})</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>In: <strong className="text-green-700">{fmtNum(totals.totalIn)}</strong></span>
                  <span>Out: <strong className="text-red-700">{fmtNum(totals.totalOut)}</strong></span>
                  <span>Net: <strong className={totals.net >= 0 ? 'text-green-700' : 'text-red-700'}>{fmtNum(totals.net)}</strong></span>
                </div>
              </div>
            </CardHeader>

            {showForm && (
              <div className="px-5 pb-4 border-b border-gray-100">
                <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                  <p className="text-sm font-medium text-gray-700">{editId ? 'Edit Entry' : 'New Cash Entry'}</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Date *</label>
                      <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Description</label>
                      <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                        placeholder="e.g. Cash payment received"
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Cash In</label>
                      <AmountInput value={form.cash_in} onChange={v => setForm(f => ({ ...f, cash_in: v }))} />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Cash Out</label>
                      <AmountInput value={form.cash_out} onChange={v => setForm(f => ({ ...f, cash_out: v }))} />
                    </div>
                    {/* Balance field hidden — not needed currently
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Balance</label>
                      <AmountInput value={form.balance} onChange={v => setForm(f => ({ ...f, balance: v }))} placeholder="Running balance" />
                    </div>
                    */}
                    <div>
                      <label className="text-xs text-gray-500 mb-1 block">Currency</label>
                      <select value={form.currency} onChange={e => setForm(f => ({ ...f, currency: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                        {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-gray-500 mb-1 block">Notes</label>
                      <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                        placeholder="Optional notes"
                        className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  {formError && <p className="text-xs text-red-600">{formError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleSave} loading={saving}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                  </div>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Date', 'Description', 'CCY', 'Cash In', 'Cash Out', 'Notes', ''].map(h => (
                      <th key={h} className={`px-5 py-3 text-xs font-medium text-gray-500${['Cash In','Cash Out'].includes(h) ? ' text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entries.map((e: any) => (
                    <tr key={e.id} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-600">{fmtDate(e.date)}</td>
                      <td className="px-5 py-3 text-gray-800 max-w-xs"><span className="block truncate" title={e.description}>{e.description || <span className="text-gray-300">—</span>}</span></td>
                      <td className="px-5 py-3"><Badge label={e.currency} variant="info" /></td>
                      <td className="px-5 py-3 text-right font-mono text-green-700">{e.cash_in != null ? fmtNum(e.cash_in) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-3 text-right font-mono text-red-700">{e.cash_out != null ? fmtNum(e.cash_out) : <span className="text-gray-300">—</span>}</td>
                      {/* Balance column hidden — not needed currently */}
                      <td className="px-5 py-3 text-gray-500 max-w-xs"><span className="block truncate text-xs" title={e.notes}>{e.notes || <span className="text-gray-300">—</span>}</span></td>
                      <td className="px-5 py-3">
                        {canWrite && (
                          <div className="flex items-center gap-1">
                            <button onClick={() => openEdit(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"><Pencil size={13} /></button>
                            {deleteId === e.id ? (
                              <span className="flex items-center gap-1 text-xs text-red-600">
                                <button onClick={() => handleDelete(e.id)} className="underline">Confirm</button>
                                <button onClick={() => setDeleteId(null)} className="underline text-gray-400">Cancel</button>
                              </span>
                            ) : (
                              <button onClick={() => setDeleteId(e.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && !loading && (
                    <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">No cash entries yet. Click "Add Entry" to get started.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* ── CASHFLOW SHEET TAB ── */}
        {tab === 'cashflow' && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 text-sm">Daily Cashflow — from Excel import ({cashflow.length} rows)</p>
                {canWrite && cashflow.length > 0 && (
                  <div className="flex items-center gap-2">
                    {clearConfirm ? (
                      <span className="flex items-center gap-2 text-xs text-red-600">
                        <span>Delete all {cashflow.length} rows?</span>
                        <button onClick={handleClearAll} disabled={clearing} className="underline font-medium">
                          {clearing ? 'Deleting…' : 'Confirm'}
                        </button>
                        <button onClick={() => setClearConfirm(false)} className="underline text-gray-400">Cancel</button>
                      </span>
                    ) : (
                      <button onClick={() => setClearConfirm(true)}
                        className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 border border-red-200 hover:border-red-400 rounded-lg px-2.5 py-1 transition-colors">
                        <Trash2 size={12} /> Clear all
                      </button>
                    )}
                  </div>
                )}
              </div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Date', 'Transaction', 'Amount AED', 'Amount USD', ''].map(h => (
                      <th key={h} className={`px-5 py-3 text-xs font-medium text-gray-500${h.startsWith('Amount') ? ' text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {cfByDate.map(([date, rows]) =>
                    rows.map((r, i) => (
                      <tr key={r.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-500">{i === 0 ? fmtDate(date) : ''}</td>
                        <td className="px-5 py-3 text-gray-800">{r.transaction_group || '—'}</td>
                        <td className="px-5 py-3 text-right font-mono text-gray-700">{r.amount_aed != null ? fmtNum(r.amount_aed) : '—'}</td>
                        <td className="px-5 py-3 text-right font-mono text-gray-700">{r.amount_usd != null ? fmtNum(r.amount_usd) : '—'}</td>
                        <td className="px-5 py-3">
                          {canWrite && (
                            cfDeleteId === r.id ? (
                              <span className="flex items-center gap-1 text-xs text-red-600">
                                <button onClick={() => handleDeleteCfRow(r.id)} className="underline">Confirm</button>
                                <button onClick={() => setCfDeleteId(null)} className="underline text-gray-400">Cancel</button>
                              </span>
                            ) : (
                              <button onClick={() => setCfDeleteId(r.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500"><Trash2 size={13} /></button>
                            )
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                  {cashflow.length === 0 && !cfLoading && (
                    <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No cashflow data imported yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}
        {/* ── COMBINED TAB ── */}
        {tab === 'both' && (
          <Card>
            <CardHeader>
              <p className="font-medium text-gray-900 text-sm">All Cash Activity ({combined.length} rows)</p>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Date', 'Source', 'Description', 'Cash In', 'Cash Out', 'CCY', 'Notes'].map(h => (
                      <th key={h} className={`px-5 py-3 text-xs font-medium text-gray-500${['Cash In','Cash Out'].includes(h) ? ' text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {combined.map(row => (
                    <tr key={row._key} className="hover:bg-gray-50">
                      <td className="px-5 py-3 text-gray-500">{fmtDate(row.date)}</td>
                      <td className="px-5 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${row._type === 'manual' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
                          {row._type === 'manual' ? 'Manual' : 'Import'}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-gray-800 max-w-xs"><span className="block truncate" title={row.description ?? ''}>{row.description || <span className="text-gray-300">—</span>}</span></td>
                      <td className="px-5 py-3 text-right font-mono text-green-700">{row.cash_in != null ? fmtNum(row.cash_in) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-3 text-right font-mono text-red-700">{row.cash_out != null ? fmtNum(row.cash_out) : <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs">{row.currency}</td>
                      <td className="px-5 py-3 text-gray-400 max-w-xs text-xs"><span className="block truncate" title={row.notes ?? ''}>{row.notes || <span className="text-gray-300">—</span>}</span></td>
                    </tr>
                  ))}
                  {combined.length === 0 && (
                    <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">No data yet</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        )}

      </div>
    </Layout>
  );
}
