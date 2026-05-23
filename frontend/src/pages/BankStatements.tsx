import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader, CardBody } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../auth/AuthContext';
import {
  getCsvAccountsStats, createCsvAccount, updateCsvAccount,
  deleteCsvAccount, importCsvFile,
} from '../api';
import { fmtDate } from '../utils/format';
import { Upload, Plus, Pencil, Trash2, X, Check, FileText } from 'lucide-react';

const CURRENCIES = ['AED', 'USD', 'EUR'];

const emptyForm = { account_number: '', company_name: '', currency: 'AED', bank_name: '' };

export default function BankStatements() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isAdmin, user } = useAuth();
  const canWrite = isAdmin || user?.role === 'accountant';

  const startDate = searchParams.get('startDate') ?? '';
  const endDate = searchParams.get('endDate') ?? '';

  const setStartDate = (v: string) => setSearchParams(p => { const n = new URLSearchParams(p); v ? n.set('startDate', v) : n.delete('startDate'); return n; }, { replace: true });
  const setEndDate   = (v: string) => setSearchParams(p => { const n = new URLSearchParams(p); v ? n.set('endDate', v)   : n.delete('endDate');   return n; }, { replace: true });
  const clearDates   = () => setSearchParams(p => { const n = new URLSearchParams(p); n.delete('startDate'); n.delete('endDate'); return n; }, { replace: true });

  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterBank, setFilterBank] = useState('');
  const [filterCurrency, setFilterCurrency] = useState('');

  // Add / edit form
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // CSV import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await getCsvAccountsStats(startDate || undefined, endDate || undefined);
      setAccounts(res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [startDate, endDate]);

  const uniqueCompanies = useMemo(() => {
    const base = accounts.filter(a =>
      (!filterBank || a.bank_name === filterBank) &&
      (!filterCurrency || a.currency === filterCurrency),
    );
    return [...new Set(base.map(a => a.company_name).filter(Boolean))].sort();
  }, [accounts, filterBank, filterCurrency]);

  const uniqueBanks = useMemo(() => {
    const base = accounts.filter(a =>
      (!filterCompany || a.company_name === filterCompany) &&
      (!filterCurrency || a.currency === filterCurrency),
    );
    return [...new Set(base.map(a => a.bank_name).filter(Boolean))].sort();
  }, [accounts, filterCompany, filterCurrency]);

  const uniqueCurrencies = useMemo(() => {
    const base = accounts.filter(a =>
      (!filterCompany || a.company_name === filterCompany) &&
      (!filterBank || a.bank_name === filterBank),
    );
    return [...new Set(base.map(a => a.currency).filter(Boolean))].sort();
  }, [accounts, filterCompany, filterBank]);

  const displayedAccounts = useMemo(() => accounts.filter(a =>
    (!filterCompany || a.company_name === filterCompany) &&
    (!filterBank || a.bank_name === filterBank) &&
    (!filterCurrency || a.currency === filterCurrency),
  ), [accounts, filterCompany, filterBank, filterCurrency]);

  const hasFilters = filterCompany || filterBank || filterCurrency;

  const openAdd = () => { setEditId(null); setForm({ ...emptyForm }); setFormError(''); setShowForm(true); };
  const openEdit = (a: any) => {
    setEditId(a.id);
    setForm({ account_number: a.account_number, company_name: a.company_name, currency: a.currency, bank_name: a.bank_name });
    setFormError('');
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.account_number.trim() || !form.company_name.trim() || !form.bank_name.trim()) {
      setFormError('All fields are required'); return;
    }
    setSaving(true); setFormError('');
    try {
      if (editId) await updateCsvAccount(editId, form);
      else await createCsvAccount(form);
      setShowForm(false);
      load();
    } catch (e: any) {
      setFormError(e?.response?.data?.message ?? 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteCsvAccount(id); load(); } finally { setDeleteId(null); }
  };

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.csv')) { setImportError('Please upload a .csv file'); return; }
    setImporting(true); setImportResult(null); setImportError('');
    try {
      const res = await importCsvFile(file);
      setImportResult(res.data);
      load();
    } catch (e: any) {
      setImportError(e?.response?.data?.message ?? 'Import failed');
    } finally { setImporting(false); }
  };

  return (
    <Layout>
      <PageHeader title="Bank Statements" subtitle="Import CSV bank statements and manage account registry" />
      <div className="p-8 space-y-6">

        {/* CSV Import */}
        {canWrite && (
          <Card>
            <CardHeader><p className="font-medium text-gray-900 text-sm">Import CSV Statement</p></CardHeader>
            <CardBody>
              <div
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
                  ${dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <Upload size={24} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">Drop a .csv file here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">The account number in the CSV must be registered below first</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              </div>

              {importing && <p className="text-sm text-blue-600 mt-3 text-center">Importing...</p>}

              {importResult && (
                <div className="mt-3 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                  <Check size={15} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>{importResult.company_name}</strong> ({importResult.account_number}) —{' '}
                    {importResult.imported} transactions imported, {importResult.skipped} skipped (already existed)
                  </span>
                </div>
              )}

              {importError && (
                <div className="mt-3 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  <X size={15} className="mt-0.5 shrink-0" />
                  <span>{importError}</span>
                </div>
              )}
            </CardBody>
          </Card>
        )}

        {/* Date filter bar */}
        <div className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-5 py-3">
          <span className="text-xs font-medium text-gray-500">Date range</span>
          <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <span className="text-xs text-gray-400">to</span>
          <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          {(startDate || endDate) && (
            <button onClick={clearDates} className="text-xs text-gray-400 hover:text-gray-600 underline ml-1">Clear</button>
          )}
          {(startDate || endDate) && (
            <span className="ml-auto text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              Filter active — applies when viewing account transactions
            </span>
          )}
        </div>

        {/* Account Registry */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="font-medium text-gray-900 text-sm">
                Account Registry
                <span className="ml-1.5 font-normal text-gray-400">
                  ({displayedAccounts.length}{hasFilters ? ` of ${accounts.length}` : ''})
                </span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={filterCompany}
                  onChange={e => setFilterCompany(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All companies</option>
                  {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={filterBank}
                  onChange={e => setFilterBank(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All banks</option>
                  {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select
                  value={filterCurrency}
                  onChange={e => setFilterCurrency(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All currencies</option>
                  {uniqueCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {hasFilters && (
                  <button
                    onClick={() => { setFilterCompany(''); setFilterBank(''); setFilterCurrency(''); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Clear
                  </button>
                )}
                {canWrite && (
                  <Button variant="secondary" size="sm" onClick={openAdd}>
                    <Plus size={13} className="mr-1" /> Add Account
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          {/* Inline add / edit form */}
          {showForm && (
            <div className="px-5 pb-4 border-b border-gray-100">
              <div className="bg-gray-50 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-gray-700">{editId ? 'Edit Account' : 'New Account'}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Account Number *</label>
                    <input value={form.account_number} onChange={(e) => setForm(f => ({ ...f, account_number: e.target.value }))}
                      placeholder="e.g. 0012443581001"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Company Name *</label>
                    <input value={form.company_name} onChange={(e) => setForm(f => ({ ...f, company_name: e.target.value }))}
                      placeholder="e.g. Ajeet Trading LLC"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Bank Name *</label>
                    <input value={form.bank_name} onChange={(e) => setForm(f => ({ ...f, bank_name: e.target.value }))}
                      placeholder="e.g. Sharjah Islamic Bank"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500 mb-1 block">Currency *</label>
                    <select value={form.currency} onChange={(e) => setForm(f => ({ ...f, currency: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                    </select>
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
                  {['Account Number', 'Company Name', 'Bank', 'Currency', 'Transactions', 'Last Transaction', 'Closing Balance', ''].map(h => (
                    <th key={h} className={`px-5 py-3 text-xs font-medium text-gray-500${h === 'Closing Balance' ? ' text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayedAccounts.map((a: any) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 font-mono text-xs text-gray-600">{a.account_number}</td>
                    <td className="px-5 py-3">
                      {a.tx_count > 0 ? (
                        <button onClick={() => {
                          const params = new URLSearchParams();
                          if (startDate) params.set('startDate', startDate);
                          if (endDate) params.set('endDate', endDate);
                          const qs = params.toString();
                          navigate(`/bank-statements/${a.id}${qs ? `?${qs}` : ''}`);
                        }} className="flex items-center gap-1 text-blue-600 hover:underline font-medium">
                          <FileText size={12} />{a.company_name}
                        </button>
                      ) : (
                        <span className="font-medium text-gray-800">{a.company_name}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{a.bank_name}</td>
                    <td className="px-5 py-3"><Badge label={a.currency} variant="info" /></td>
                    <td className="px-5 py-3 text-gray-500">{a.tx_count > 0 ? a.tx_count.toLocaleString() : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3 text-gray-500">{a.latest_date ? fmtDate(a.latest_date) : <span className="text-gray-300">—</span>}</td>
                    <td className="px-5 py-3 text-right font-mono text-gray-700">
                      {a.latest_balance != null ? Number(a.latest_balance).toLocaleString('en-AE', { minimumFractionDigits: 2 }) : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3">
                      {canWrite && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700">
                            <Pencil size={13} />
                          </button>
                          {deleteId === a.id ? (
                            <span className="flex items-center gap-1 text-xs text-red-600">
                              <button onClick={() => handleDelete(a.id)} className="underline">Confirm</button>
                              <button onClick={() => setDeleteId(null)} className="underline text-gray-400">Cancel</button>
                            </span>
                          ) : (
                            <button onClick={() => setDeleteId(a.id)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
                {displayedAccounts.length === 0 && !loading && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    {hasFilters ? 'No accounts match the selected filters' : 'No accounts registered yet'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
