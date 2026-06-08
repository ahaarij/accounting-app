import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { getResults, getSummary, deleteReconResult, API_BASE } from '../api';
import { Download, Calendar, ExternalLink, Search, ArrowUpDown, Trash2 } from 'lucide-react';
import { fmtDate } from '../utils/format';

function fmtNum(v: any) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 });
}

export default function ReconciliationReport() {
  const navigate = useNavigate();
  const [date, setDate] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [errorsFirst, setErrorsFirst] = useState(false);
  const [filterCompany, setFilterCompany] = useState('');
  const [filterBank, setFilterBank] = useState('');
  const [filterCurrency, setFilterCurrency] = useState('');
  const [filterGroup, setFilterGroup] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [r, s] = await Promise.all([getResults(date || undefined), getSummary(date || undefined)]);
      setResults(r.data);
      setSummary(s.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const passed = results.filter((r) => r.status === 'matched' || r.status === 'pass').length;
  const failed = results.length - passed;

  const uniqueCompanies = useMemo(() => {
    const base = results.filter(r =>
      (!filterBank || r.bank_name === filterBank) &&
      (!filterCurrency || r.currency === filterCurrency),
    );
    return [...new Set(base.map(r => r.account_name).filter(Boolean))].sort();
  }, [results, filterBank, filterCurrency]);

  const uniqueBanks = useMemo(() => {
    const base = results.filter(r =>
      (!filterCompany || r.account_name === filterCompany) &&
      (!filterCurrency || r.currency === filterCurrency),
    );
    return [...new Set(base.map(r => r.bank_name).filter(Boolean))].sort();
  }, [results, filterCompany, filterCurrency]);

  const uniqueCurrencies = useMemo(() => {
    const base = results.filter(r =>
      (!filterCompany || r.account_name === filterCompany) &&
      (!filterBank || r.bank_name === filterBank),
    );
    return [...new Set(base.map(r => r.currency).filter(Boolean))].sort();
  }, [results, filterCompany, filterBank]);

  const displayResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    let filtered = results.filter((r) => {
      if (q && !(r.account_name ?? '').toLowerCase().includes(q) && !(r.account_code ?? '').toLowerCase().includes(q)) return false;
      if (filterCompany && r.account_name !== filterCompany) return false;
      if (filterBank && r.bank_name !== filterBank) return false;
      if (filterCurrency && r.currency !== filterCurrency) return false;
      if (filterGroup && r.group !== filterGroup) return false;
      return true;
    });
    if (errorsFirst) {
      filtered = [...filtered].sort((a, b) => {
        const aErr = a.status !== 'matched' && a.status !== 'pass' ? 0 : 1;
        const bErr = b.status !== 'matched' && b.status !== 'pass' ? 0 : 1;
        return aErr - bErr;
      });
    }
    return filtered;
  }, [results, search, errorsFirst, filterCompany, filterBank, filterCurrency]);

  const hasFilters = search || filterCompany || filterBank || filterCurrency || filterGroup;
  const clearFilters = () => { setSearch(''); setFilterCompany(''); setFilterBank(''); setFilterCurrency(''); setFilterGroup(''); };

  const handleDelete = async (r: any) => {
    if (!confirm(`Delete reconciliation result for "${r.account_name ?? 'this account'}" on ${fmtDate(r.date)}?\n\nThis cannot be undone.`)) return;
    await deleteReconResult(r.id);
    setResults(prev => prev.filter(x => x.id !== r.id));
  };

  const goToAccount = (r: any) => {
    if (!r.bank_account_id) return;
    const isDisc = r.status !== 'matched' && r.status !== 'pass';
    navigate(`/accounts/${r.bank_account_id}`, {
      state: isDisc ? {
        highlightDate: r.date,
        severity: 'critical',
        description: r.notes || `Balance discrepancy — expected ${fmtNum(r.expected_closing_balance)}, actual ${fmtNum(r.actual_closing_balance)}`,
        difference: Number(r.difference ?? 0),
      } : undefined,
    });
  };

  return (
    <Layout>
      <PageHeader
        title="Reconciliation Report"
        subtitle="10-check engine results with expected vs actual detail"
        action={
          <a href={`${API_BASE}/reconciliation/report/${date || 'latest'}/pdf`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Download size={14} /> Export PDF
          </a>
        }
      />
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Calendar size={16} className="text-gray-400" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <Button variant="secondary" size="sm" onClick={load} loading={loading}>Filter</Button>
          {date && <Button variant="ghost" size="sm" onClick={() => { setDate(''); setTimeout(load, 0); }}>Clear</Button>}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[220px]">
            <option value="">All companies</option>
            {uniqueCompanies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterBank} onChange={(e) => setFilterBank(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[200px]">
            <option value="">All banks</option>
            {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
          </select>

          <select value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All currencies</option>
            {uniqueCurrencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>

          <select value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">All groups</option>
            <option value="A">Group A</option>
            <option value="B">Group B</option>
          </select>

          {hasFilters && <Button variant="ghost" size="sm" onClick={clearFilters}>Clear filters</Button>}

          <div className="relative ml-auto">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            <input type="text" placeholder="Search company..." value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-52 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total results', value: results.length },
            { label: 'Matched / passed', value: passed },
            { label: 'Discrepancies', value: failed, highlight: failed > 0 },
            { label: 'Open flags', value: summary?.total_flags ?? '—' },
          ].map(({ label, value, highlight }) => (
            <div key={label} className={`rounded-xl border px-6 py-4 ${highlight ? 'bg-red-50 border-red-200' : 'bg-white border-gray-200'}`}>
              <p className={`text-2xl font-bold ${highlight ? 'text-red-700' : 'text-gray-900'}`}>{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <p className="font-medium text-gray-900 text-sm">
              Check results ({displayResults.length}{hasFilters ? ` of ${results.length}` : ''})
            </p>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead>
                <tr className="bg-gray-50 text-left">
                  {['Account', 'Date'].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500">{h}</th>
                  ))}
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">
                    <button
                      onClick={() => setErrorsFirst((v) => !v)}
                      className={`flex items-center gap-1 hover:text-gray-800 transition-colors ${errorsFirst ? 'text-red-600 font-semibold' : ''}`}
                    >
                      Status <ArrowUpDown size={11} />
                    </button>
                  </th>
                  {['Expected', 'Actual', 'Difference'].map((h) => (
                    <th key={h} className="px-5 py-3 text-xs font-medium text-gray-500 text-right">{h}</th>
                  ))}
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Notes</th>
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayResults.map((r: any, i: number) => {
                  const isDisc = r.status !== 'matched' && r.status !== 'pass';
                  const diff = Number(r.difference ?? 0);
                  return (
                    <tr key={i} className={`hover:bg-gray-50 ${isDisc ? 'bg-red-50/40' : ''}`}>
                      <td className="px-5 py-3">
                        {r.bank_account_id ? (
                          <button onClick={() => goToAccount(r)}
                            className="flex items-center gap-1 text-blue-600 hover:underline font-medium">
                            <ExternalLink size={11} />{r.account_name ?? `#${r.bank_account_id}`}
                          </button>
                        ) : <span className="text-gray-400">—</span>}
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                          {[r.bank_name, r.currency, r.account_code].filter(Boolean).join(' · ')}
                          {r.group && (
                            <span className={`inline-block text-[10px] font-bold px-1 py-0.5 rounded ${
                              r.group === 'A' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'
                            }`}>Grp {r.group}</span>
                          )}
                        </p>
                      </td>
                      <td className="px-5 py-3 text-gray-500">{fmtDate(r.date)}</td>
                      <td className="px-5 py-3">
                        <Badge label={r.status} variant={isDisc ? 'critical' : 'success'} />
                      </td>
                      <td className="px-5 py-3 text-right font-mono text-gray-700">{fmtNum(r.expected_closing_balance)}</td>
                      <td className="px-5 py-3 text-right font-mono text-gray-700">{fmtNum(r.actual_closing_balance)}</td>
                      <td className={`px-5 py-3 text-right font-mono font-semibold ${diff === 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {diff === 0 ? '0.00' : (diff > 0 ? '+' : '') + fmtNum(r.difference)}
                      </td>
                      <td className="px-5 py-3 text-gray-500 max-w-xs">
                        <span className="block truncate" title={r.notes}>{r.notes || '—'}</span>
                      </td>
                      <td className="px-3 py-3">
                        <button
                          onClick={() => handleDelete(r)}
                          className="text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete this result"
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {displayResults.length === 0 && !loading && (
                  <tr><td colSpan={7} className="px-6 py-8 text-center text-gray-400">
                    {search ? `No results matching "${search}"` : 'No results found'}
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
