import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader, CardBody } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { useAuth } from '../auth/AuthContext';
import {
  getCsvAccountsStats, createCsvAccount, updateCsvAccount,
  deleteCsvAccount, importCsvFile, importPdfFile, previewPdfFile, setCsvAccountPdfPassword,
  deleteAllBankStatements,
} from '../api';
import { fmtDate } from '../utils/format';
import { Upload, Plus, Pencil, Trash2, X, Check, FileText, Lock, Unlock, Eye, EyeOff } from 'lucide-react';

const CURRENCIES = ['AED', 'USD', 'EUR'];
const emptyForm = { account_number: '', company_name: '', currency: 'AED', bank_name: '' };

export default function BankStatements() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canEdit } = useAuth();
  const canWrite = canEdit;

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

  // Secret nuke modal
  const [showNuke, setShowNuke] = useState(false);
  const [nukeCode, setNukeCode] = useState('');
  const [nukeError, setNukeError] = useState('');
  const [nuking, setNuking] = useState(false);

  const handleNuke = async () => {
    if (nukeCode !== '111') { setNukeError('Wrong code'); return; }
    setNuking(true); setNukeError('');
    try {
      await deleteAllBankStatements();
      setShowNuke(false);
      setNukeCode('');
      load();
    } catch {
      setNukeError('Failed to delete');
    } finally { setNuking(false); }
  };

  // PDF password management
  const [pwdEditId, setPwdEditId] = useState<number | null>(null);
  const [pwdValue, setPwdValue] = useState('');
  const [pwdShow, setPwdShow] = useState(false);
  const [pwdSaving, setPwdSaving] = useState(false);
  const [pwdError, setPwdError] = useState('');

  // CSV import
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);
  const [importError, setImportError] = useState('');
  const [dragOver, setDragOver] = useState(false);

  // PDF import / preview
  const pdfRef = useRef<HTMLInputElement>(null);
  const [pdfMode, setPdfMode] = useState<'import' | 'preview'>('import');
  const [pdfPassword, setPdfPassword] = useState('');
  const [pdfPwdShow, setPdfPwdShow] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfResult, setPdfResult] = useState<any>(null);
  const [pdfError, setPdfError] = useState('');
  const [pdfDragOver, setPdfDragOver] = useState(false);

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

  // CSV import
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

  // PDF import / preview handler
  const handlePdfFiles = async (incoming: FileList | File[]) => {
    const files = Array.from(incoming);
    if (!files.length) return;
    if (pdfMode === 'preview') {
      // preview only supports one file
      const file = files[0];
      if (!file.name.toLowerCase().endsWith('.pdf')) { setPdfError('Please upload a .pdf file'); return; }
      setPdfBusy(true); setPdfResult(null); setPdfError('');
      try {
        const res = await previewPdfFile(file, pdfPassword || undefined);
        setPdfResult({ _preview: true, ...res.data });
      } catch (e: any) {
        setPdfError(e?.response?.data?.message ?? 'Failed');
      } finally { setPdfBusy(false); }
    } else {
      const nonPdf = files.find(f => !f.name.toLowerCase().endsWith('.pdf'));
      if (nonPdf) { setPdfError(`"${nonPdf.name}" is not a PDF`); return; }
      setPdfBusy(true); setPdfResult(null); setPdfError('');
      try {
        const res = await importPdfFile(files, pdfPassword || undefined);
        setPdfResult(res.data);
        load();
      } catch (e: any) {
        setPdfError(e?.response?.data?.message ?? 'Failed');
      } finally { setPdfBusy(false); }
    }
  };

  // Per-account PDF password
  const openPwdEdit = (a: any) => {
    setPwdEditId(a.id);
    setPwdValue(a.pdf_password ?? '');
    setPwdShow(false);
    setPwdError('');
  };

  const handleSavePwd = async () => {
    if (!pwdEditId) return;
    setPwdSaving(true); setPwdError('');
    try {
      const updated = await setCsvAccountPdfPassword(pwdEditId, pwdValue);
      setAccounts(prev => prev.map(a => a.id === pwdEditId ? { ...a, pdf_password: (updated.data as any).pdf_password } : a));
      setPwdEditId(null);
    } catch (e: any) {
      setPwdError(e?.response?.data?.message ?? 'Failed to save password');
    } finally { setPwdSaving(false); }
  };

  return (
    <Layout>
      <PageHeader title="Bank Statements (Work in progress)" subtitle="Import CSV bank statements and manage account registry" />
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
                <p className="text-xs text-gray-400 mt-1">Account is auto-detected from the file</p>
                <input ref={fileRef} type="file" accept=".csv" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ''; }} />
              </div>

              {importing && <p className="text-sm text-blue-600 mt-3 text-center">Importing...</p>}
              {importResult && (
                <div className="mt-3 flex items-start gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800">
                  <Check size={15} className="mt-0.5 shrink-0" />
                  <span>
                    <strong>{importResult.company_name}</strong> ({importResult.account_number}) —{' '}
                    {importResult.imported} imported, {importResult.skipped} skipped
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

        {/* PDF Import / Preview */}
        {canWrite && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 text-sm">PDF Statement</p>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 text-xs">
                  {(['import', 'preview'] as const).map(m => (
                    <button key={m} onClick={() => { setPdfMode(m); setPdfResult(null); setPdfError(''); }}
                      className={`px-3 py-1 rounded-md font-medium capitalize transition-colors ${pdfMode === m ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
                      {m}
                    </button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardBody className="space-y-3">
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Password {pdfMode === 'preview' ? '(if protected)' : '(applies to all files; uses saved password if blank)'}</label>
                <div className="relative">
                  <input type={pdfPwdShow ? 'text' : 'password'} value={pdfPassword}
                    onChange={e => setPdfPassword(e.target.value)}
                    placeholder={pdfMode === 'import' ? 'Uses saved password per account if blank' : 'Leave blank if not protected'}
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 pr-8 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500" />
                  <button type="button" onClick={() => setPdfPwdShow(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    {pdfPwdShow ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                </div>
              </div>

              <div
                onDragOver={(e) => { e.preventDefault(); setPdfDragOver(true); }}
                onDragLeave={() => setPdfDragOver(false)}
                onDrop={(e) => { e.preventDefault(); setPdfDragOver(false); if (e.dataTransfer.files.length) handlePdfFiles(e.dataTransfer.files); }}
                onClick={() => pdfRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors
                  ${pdfDragOver ? 'border-purple-400 bg-purple-50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
              >
                <FileText size={22} className="mx-auto mb-2 text-gray-400" />
                <p className="text-sm font-medium text-gray-700">
                  {pdfMode === 'import' ? 'Drop one or more .pdf files to import' : 'Drop a .pdf to preview extracted text'}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {pdfMode === 'import' ? 'Each PDF is auto-detected — mix banks freely' : 'Password-protected PDFs supported'}
                </p>
                <input ref={pdfRef} type="file" accept=".pdf" multiple={pdfMode === 'import'} className="hidden"
                  onChange={(e) => { if (e.target.files?.length) handlePdfFiles(e.target.files); e.target.value = ''; }} />
              </div>

              {pdfBusy && <p className="text-sm text-blue-600 text-center">{pdfMode === 'preview' ? 'Extracting text…' : 'Importing…'}</p>}

              {Array.isArray(pdfResult) && pdfResult.length > 0 && (
                <div className="space-y-2">
                  {pdfResult.map((r: any, i: number) => (
                    r.warning ? (
                      <div key={i} className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
                        <span>⚠ {r.warning}</span>
                      </div>
                    ) : (
                      <div key={i} className="bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-sm text-green-800 space-y-1">
                        <div className="flex items-center gap-2">
                          <Check size={15} className="shrink-0" />
                          <span className="font-semibold">{r.bank} · {r.pages} page{r.pages !== 1 ? 's' : ''}</span>
                        </div>
                        {(r.accounts ?? []).map((a: any, j: number) => (
                          <div key={j} className="pl-5 text-xs text-green-700">
                            <strong>{a.company_name}</strong> ({a.account_number}) — {a.imported} imported, {a.skipped} skipped{a.created ? ' · account auto-created' : ''}
                          </div>
                        ))}
                      </div>
                    )
                  ))}
                </div>
              )}

              {pdfResult?._preview && (
                <div className="space-y-4">
                  <p className="text-xs text-gray-500">
                    {pdfResult.pages} page{pdfResult.pages !== 1 ? 's' : ''} · {pdfResult.lines} non-empty lines
                    {pdfResult.tables?.length > 0 && ` · ${pdfResult.tables.length} table${pdfResult.tables.length !== 1 ? 's' : ''} detected`}
                  </p>

                  {pdfResult.tables?.length > 0 ? (
                    pdfResult.tables.map((tbl: { page: number; rows: string[][] }, ti: number) => {
                      const [header, ...body] = tbl.rows;
                      return (
                        <div key={ti}>
                          <p className="text-xs font-medium text-gray-500 mb-1.5">
                            Table {ti + 1} — page {tbl.page}
                          </p>
                          <div className="overflow-x-auto rounded-xl border border-gray-200">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-gray-50">
                                  {header.map((h, i) => (
                                    <th key={i} className="px-4 py-2.5 text-left text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">
                                      {h || '—'}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                {body.map((row, ri) => {
                                  const isTotal = row.some(c => /^total$/i.test(c.trim()));
                                  return (
                                    <tr key={ri} className={isTotal ? 'bg-gray-50 font-semibold' : 'hover:bg-gray-50'}>
                                      {row.map((cell, ci) => (
                                        <td key={ci} className={`px-4 py-2 text-gray-700 whitespace-nowrap ${/^[\d,.\-]+$/.test(cell.trim()) ? 'text-right font-mono' : ''}`}>
                                          {cell || '—'}
                                        </td>
                                      ))}
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">No tables detected — raw text</p>
                      <pre className="bg-gray-50 border border-gray-200 rounded-xl p-3 text-xs text-gray-700 overflow-auto max-h-72 whitespace-pre-wrap">
                        {pdfResult.text}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {pdfError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
                  <X size={15} className="mt-0.5 shrink-0" /><span>{pdfError}</span>
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
                {canWrite && (
                  <button
                    onClick={() => { setShowNuke(true); setNukeCode(''); setNukeError(''); }}
                    className="ml-3 w-2 h-2 rounded-full bg-gray-200 hover:bg-red-300 transition-colors opacity-40 hover:opacity-100"
                    title=""
                  />
                )}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <select value={filterCompany} onChange={e => setFilterCompany(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All companies</option>
                  {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select value={filterBank} onChange={e => setFilterBank(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All banks</option>
                  {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
                <select value={filterCurrency} onChange={e => setFilterCurrency(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="">All currencies</option>
                  {uniqueCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {hasFilters && (
                  <button onClick={() => { setFilterCompany(''); setFilterBank(''); setFilterCurrency(''); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline">Clear</button>
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

          {/* Inline PDF password editor */}
          {pwdEditId !== null && (
            <div className="px-5 pb-4 border-b border-gray-100">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">
                  PDF Password — {accounts.find(a => a.id === pwdEditId)?.company_name}
                </p>
                <p className="text-xs text-amber-700">
                  This password will be used automatically when importing PDFs for this account. Leave blank to clear.
                </p>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={pwdShow ? 'text' : 'password'}
                      value={pwdValue}
                      onChange={e => setPwdValue(e.target.value)}
                      placeholder="Enter PDF password"
                      className="w-full border border-amber-300 rounded-lg px-3 py-1.5 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                    />
                    <button type="button" onClick={() => setPwdShow(v => !v)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-amber-400 hover:text-amber-600">
                      {pwdShow ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <Button size="sm" onClick={handleSavePwd} loading={pwdSaving}>Save</Button>
                  <Button variant="ghost" size="sm" onClick={() => setPwdEditId(null)}>Cancel</Button>
                </div>
                {pwdError && <p className="text-xs text-red-600">{pwdError}</p>}
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
                          <button
                            onClick={() => openPwdEdit(a)}
                            title={a.pdf_password ? 'PDF password set — click to change' : 'Set PDF password'}
                            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${a.pdf_password ? 'text-amber-500 hover:text-amber-600' : 'text-gray-300 hover:text-gray-500'}`}
                          >
                            {a.pdf_password ? <Lock size={13} /> : <Unlock size={13} />}
                          </button>
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
                  <tr><td colSpan={8} className="px-6 py-8 text-center text-gray-400">
                    {hasFilters ? 'No accounts match the selected filters' : 'No accounts registered yet'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Secret nuke modal */}
      {showNuke && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-80 space-y-4">
            <p className="font-semibold text-gray-900 text-sm">Enter code to confirm</p>
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
              <Button size="sm" onClick={handleNuke} loading={nuking}
                className="bg-red-600 hover:bg-red-700 text-white">Delete all</Button>
              <Button variant="ghost" size="sm" onClick={() => setShowNuke(false)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
