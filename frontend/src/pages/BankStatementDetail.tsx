import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { getCsvTransactions } from '../api';
import { fmtDate } from '../utils/format';
import { ArrowLeft, Search } from 'lucide-react';

function fmtNum(v: any) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 });
}

export default function BankStatementDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const startDate = searchParams.get('startDate') ?? '';
  const endDate   = searchParams.get('endDate')   ?? '';

  const [account, setAccount] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = async (p = 1) => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getCsvTransactions(parseInt(id), p, startDate || undefined, endDate || undefined);
      setAccount(res.data.account);
      setTransactions(res.data.transactions);
      setPage(res.data.page);
      setPages(res.data.pages);
      setTotal(res.data.total);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(1); }, [id, startDate, endDate]);

  const displayed = search.trim()
    ? transactions.filter(t =>
        (t.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.ref ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : transactions;

  const totalDebits = transactions.reduce((s, t) => s + Number(t.debit ?? 0), 0);
  const totalCredits = transactions.reduce((s, t) => s + Number(t.credit ?? 0), 0);
  const latestBalance = transactions.length > 0 ? Number(transactions[0].balance ?? 0) : null;

  return (
    <Layout>
      <PageHeader
        title={account?.company_name ?? 'Bank Statement'}
        subtitle={account ? `${account.account_number} · ${account.bank_name} · ${account.currency}` : ''}
        action={
          <Button variant="ghost" size="sm" onClick={() => {
            const qs = searchParams.toString();
            navigate(`/bank-statements${qs ? `?${qs}` : ''}`);
          }}>
            <ArrowLeft size={14} className="mr-1" /> Back
          </Button>
        }
      />
      <div className="p-8 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Total transactions', value: total.toLocaleString() },
            { label: 'Total credits', value: fmtNum(totalCredits.toFixed(2)) },
            { label: 'Total debits', value: fmtNum(totalDebits.toFixed(2)) },
            { label: 'Latest balance', value: latestBalance != null ? fmtNum(latestBalance.toFixed(2)) : '—' },
          ].map(({ label, value }) => (
            <div key={label} className="rounded-xl border border-gray-200 bg-white px-6 py-4">
              <p className="text-2xl font-bold text-gray-900 font-mono">{value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{label}</p>
            </div>
          ))}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="font-medium text-gray-900 text-sm">
                Transactions ({total.toLocaleString()})
                {account?.iban && <span className="ml-2 text-xs font-normal text-gray-400">IBAN: {account.iban}</span>}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                {(startDate || endDate) && (
                  <span className="text-xs text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                    {startDate && endDate ? `${fmtDate(startDate)} – ${fmtDate(endDate)}` : startDate ? `From ${fmtDate(startDate)}` : `Until ${fmtDate(endDate)}`}
                    <span className="ml-1 text-blue-400">· clear from Bank Statements</span>
                  </span>
                )}
                <div className="relative">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search description / ref..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Date</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Description</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500">Reference</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 text-right">Debit</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 text-right">Credit</th>
                  <th className="px-5 py-3 text-xs font-medium text-gray-500 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayed.map((t: any) => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-5 py-3 text-gray-500 whitespace-nowrap">{fmtDate(t.date)}</td>
                    <td className="px-5 py-3 text-gray-800 max-w-xs">
                      <span className="block truncate" title={t.description}>{t.description || '—'}</span>
                    </td>
                    <td className="px-5 py-3 text-gray-400 font-mono text-xs whitespace-nowrap">
                      {t.ref ? t.ref.replace(/^'|'$/g, '') : '—'}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-medium text-red-600 whitespace-nowrap">
                      {t.debit != null ? fmtNum(t.debit) : ''}
                    </td>
                    <td className="px-5 py-3 text-right font-mono font-medium text-green-600 whitespace-nowrap">
                      {t.credit != null ? fmtNum(t.credit) : ''}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-gray-700 whitespace-nowrap">
                      {fmtNum(t.balance)}
                    </td>
                  </tr>
                ))}
                {page === pages && !search && transactions.length > 0 && (() => {
                  const earliest = transactions[transactions.length - 1];
                  const openingBal = Number(earliest.balance ?? 0)
                    - Number(earliest.credit ?? 0)
                    + Number(earliest.debit ?? 0);
                  return (
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td className="px-5 py-3 text-gray-400 text-xs italic whitespace-nowrap">{fmtDate(earliest.date)}</td>
                      <td className="px-5 py-3 text-gray-500 text-xs italic font-medium">Opening Balance</td>
                      <td className="px-5 py-3" />
                      <td className="px-5 py-3" />
                      <td className="px-5 py-3" />
                      <td className="px-5 py-3 text-right font-mono font-semibold text-gray-700 whitespace-nowrap">
                        {fmtNum(openingBal.toFixed(2))}
                      </td>
                    </tr>
                  );
                })()}
                {displayed.length === 0 && !loading && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    {search ? `No transactions matching "${search}"` : 'No transactions'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>Page {page} of {pages}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => load(page - 1)} disabled={page <= 1}>Previous</Button>
                <Button variant="ghost" size="sm" onClick={() => load(page + 1)} disabled={page >= pages}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
