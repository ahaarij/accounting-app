import { useEffect, useState, useMemo } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader } from '../components/ui/card';
import { getCompanyNames, getCompanyTransactions } from '../api';
import { fmtDate } from '../utils/format';
import { Building2 } from 'lucide-react';

function fmtNum(v: any) {
  if (v == null || Number(v) === 0) return '—';
  return Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 });
}

const CURRENCY_TABS = ['All', 'AED', 'USD', 'EUR'];

export default function CompanyView() {
  const [companies, setCompanies] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [currency, setCurrency] = useState('All');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);

  const [filterBank, setFilterBank] = useState('');

  const [txns, setTxns] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    getCompanyNames().then(r => setCompanies(r.data));
  }, []);

  const matchedCompanies = useMemo(() => {
    if (!search.trim()) return [];
    return companies.filter(c => c.toLowerCase().includes(search.toLowerCase()));
  }, [companies, search]);

  const load = async (p = 1) => {
    if (!search.trim()) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await getCompanyTransactions(
        search.trim(),
        currency === 'All' ? undefined : currency,
        startDate || undefined,
        endDate || undefined,
        p,
      );
      setTxns(res.data.data);
      setTotal(res.data.total);
      setPages(res.data.pages);
      setPage(p);
    } finally { setLoading(false); }
  };

  // Auto-load when currency / dates change (only if already searched)
  useEffect(() => {
    if (searched && search.trim()) load(1);
  }, [currency, startDate, endDate]);

  const uniqueBanks = useMemo(() =>
    [...new Set(txns.map(t => t.bank_name).filter(Boolean))].sort(),
  [txns]);

  const displayedTxns = useMemo(() =>
    filterBank ? txns.filter(t => t.bank_name === filterBank) : txns,
  [txns, filterBank]);

  const totalDeposits = displayedTxns.reduce((s, t) => s + Number(t.credit ?? 0), 0);
  const totalWithdrawals = displayedTxns.reduce((s, t) => s + Number(t.debit ?? 0), 0);

  const uniqueAccountsInResults = useMemo(() =>
    [...new Set(displayedTxns.map(t => t.account_name))].sort(),
  [displayedTxns]);

  return (
    <Layout>
      <PageHeader
        title="Company View"
        subtitle="View all transactions across a company's accounts, filtered by currency"
      />
      <div className="p-8 space-y-6">

        {/* Search bar */}
        <Card>
          <div className="px-6 py-5 flex items-end gap-4 flex-wrap">
            <div className="flex-1 min-w-48">
              <label className="block text-xs text-gray-500 mb-1.5">Company search</label>
              <div className="relative">
                <Building2 size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  list="company-suggestions"
                  placeholder="e.g. Pinnacle, Bullfrog..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && load(1)}
                  className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <datalist id="company-suggestions">
                  {companies.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              {matchedCompanies.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {matchedCompanies.map(c => (
                    <span key={c} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-0.5 rounded-full border border-blue-200">
                      {c}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">From</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">To</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                className="border border-gray-200 rounded-lg px-2 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <button
              onClick={() => load(1)}
              disabled={!search.trim() || loading}
              className="px-5 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {loading ? 'Loading...' : 'Search'}
            </button>
            {(startDate || endDate) && (
              <button onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-xs text-gray-400 hover:text-gray-600 underline self-end pb-2">
                Clear dates
              </button>
            )}
          </div>
        </Card>

        {searched && (
          <>
            {/* Currency tabs + bank filter */}
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex gap-1 bg-gray-100 p-1 rounded-xl">
                {CURRENCY_TABS.map(tab => (
                  <button
                    key={tab}
                    onClick={() => { setCurrency(tab); setFilterBank(''); }}
                    className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      currency === tab
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {tab}
                  </button>
                ))}
              </div>
              {uniqueBanks.length > 0 && (
                <select
                  value={filterBank}
                  onChange={e => setFilterBank(e.target.value)}
                  className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All banks</option>
                  {uniqueBanks.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Total transactions', value: total.toLocaleString() },
                { label: `Total credits${currency === 'All' ? '' : ` (${currency})`}`, value: fmtNum(totalDeposits.toFixed(2)) },
                { label: `Total debits${currency === 'All' ? '' : ` (${currency})`}`, value: fmtNum(totalWithdrawals.toFixed(2)) },
                { label: 'Accounts matched', value: uniqueAccountsInResults.length.toString() },
              ].map(({ label, value }) => (
                <div key={label} className="rounded-xl border border-gray-200 bg-white px-6 py-4">
                  <p className="text-xl font-bold text-gray-900 font-mono">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {/* Matched accounts chips */}
            {uniqueAccountsInResults.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {uniqueAccountsInResults.map(name => (
                  <span key={name} className="text-xs bg-gray-100 text-gray-600 px-3 py-1 rounded-full border border-gray-200">
                    {name}
                  </span>
                ))}
              </div>
            )}

            {/* Transactions table */}
            <Card>
              <CardHeader>
                <p className="font-medium text-gray-900 text-sm">
                  Transactions
                  <span className="ml-1.5 font-normal text-gray-400">
                    ({total.toLocaleString()} total{pages > 1 ? `, page ${page} of ${pages}` : ''})
                  </span>
                </p>
              </CardHeader>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-5 py-3 text-xs font-medium text-gray-500">Date</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500">Account</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500">Bank</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500">Ccy</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500">Description</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 text-right">Credit</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 text-right">Debit</th>
                      <th className="px-5 py-3 text-xs font-medium text-gray-500 text-right">Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {displayedTxns.map((t: any) => (
                      <tr key={t.id} className="hover:bg-gray-50">
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(t.date)}</td>
                        <td className="px-5 py-3 text-gray-800 font-medium whitespace-nowrap">{t.account_name}</td>
                        <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{t.bank_name}</td>
                        <td className="px-5 py-3">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            t.currency === 'USD' ? 'bg-green-50 text-green-700' :
                            t.currency === 'EUR' ? 'bg-purple-50 text-purple-700' :
                            'bg-blue-50 text-blue-700'
                          }`}>{t.currency}</span>
                        </td>
                        <td className="px-5 py-3 text-gray-700 max-w-xs">
                          <span className="block truncate" title={t.description}>{t.description || '—'}</span>
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-green-700 whitespace-nowrap">
                          {t.credit != null && Number(t.credit) > 0 ? fmtNum(t.credit) : ''}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-red-600 whitespace-nowrap">
                          {t.debit != null && Number(t.debit) > 0 ? fmtNum(t.debit) : ''}
                        </td>
                        <td className="px-5 py-3 text-right font-mono text-gray-700 whitespace-nowrap">
                          {fmtNum(t.balance)}
                        </td>
                      </tr>
                    ))}
                    {displayedTxns.length === 0 && !loading && (
                      <tr><td colSpan={8} className="px-6 py-10 text-center text-gray-400">
                        No transactions found
                      </td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {pages > 1 && (
                <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
                  <span>Page {page} of {pages} · {total.toLocaleString()} transactions</span>
                  <div className="flex gap-2">
                    <button onClick={() => load(page - 1)} disabled={page <= 1}
                      className="px-3 py-1 rounded border border-gray-200 text-xs hover:bg-gray-50 disabled:opacity-40">Previous</button>
                    <button onClick={() => load(page + 1)} disabled={page >= pages}
                      className="px-3 py-1 rounded border border-gray-200 text-xs hover:bg-gray-50 disabled:opacity-40">Next</button>
                  </div>
                </div>
              )}
            </Card>
          </>
        )}

        {!searched && (
          <div className="text-center py-20 text-gray-400 text-sm">
            Search for a company above to view their transactions
          </div>
        )}
      </div>
    </Layout>
  );
}
