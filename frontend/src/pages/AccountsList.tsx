import { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card } from '../components/ui/card';
import { getExcelAllAccounts } from '../api';
import { ArrowLeft, ChevronRight } from 'lucide-react';

const ACTIVE_CUTOFF_DAYS = 45;

function fmt(n: number) {
  return Number(n).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-AE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysSince(d: string | null): number | null {
  if (!d) return null;
  return (Date.now() - new Date(d).getTime()) / (1000 * 60 * 60 * 24);
}

export default function AccountsList() {
  const { type } = useParams<{ type: 'active' | 'passive' }>();
  const navigate = useNavigate();
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const isActivePage = type === 'active';

  useEffect(() => {
    getExcelAllAccounts()
      .then(r => setAccounts(r.data))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return accounts
      .filter(a => {
        const days = daysSince(a.last_transaction_date);
        const active = days !== null && days <= ACTIVE_CUTOFF_DAYS;
        return isActivePage ? active : !active;
      })
      .sort((a, b) => {
        const da = a.last_transaction_date ? new Date(a.last_transaction_date).getTime() : 0;
        const db = b.last_transaction_date ? new Date(b.last_transaction_date).getTime() : 0;
        return isActivePage ? db - da : da - db; // active: newest first; passive: oldest first
      });
  }, [accounts, isActivePage]);

  const totalAed = useMemo(
    () => filtered.filter(a => a.currency === 'AED').reduce((s, a) => s + (Number(a.closing_balance) || 0), 0),
    [filtered],
  );
  const totalUsd = useMemo(
    () => filtered.filter(a => a.currency === 'USD').reduce((s, a) => s + (Number(a.closing_balance) || 0), 0),
    [filtered],
  );

  return (
    <Layout>
      <PageHeader
        title={isActivePage ? 'Active Accounts' : 'Passive Accounts'}
        subtitle={
          isActivePage
            ? `Accounts with a transaction in the last ${ACTIVE_CUTOFF_DAYS} days`
            : `Accounts with no transaction in the last ${ACTIVE_CUTOFF_DAYS} days`
        }
        action={
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ArrowLeft size={14} />
            Back to Dashboard
          </button>
        }
      />

      <div className="px-8 pt-6 flex gap-6">
        <div className="text-sm text-gray-500">
          <span className="font-semibold text-gray-900 text-base">{filtered.length}</span> accounts
        </div>
        {totalAed > 0 && (
          <div className="text-sm text-gray-500">
            AED <span className="font-semibold text-emerald-700 tabular-nums">{fmt(totalAed)}</span>
          </div>
        )}
        {totalUsd > 0 && (
          <div className="text-sm text-gray-500">
            USD <span className="font-semibold text-blue-700 tabular-nums">{fmt(totalUsd)}</span>
          </div>
        )}
      </div>

      <div className="px-8 py-4">
        <Card>
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex items-center justify-center h-48 text-sm text-gray-400">
              No {isActivePage ? 'active' : 'passive'} accounts found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Company</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Bank</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">CCY</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Last Transaction</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Balance</th>
                    <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Group</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(acc => (
                    <tr
                      key={acc.id}
                      onClick={() => navigate(`/excel-balance?accountId=${acc.id}`)}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-3">
                        <p className="font-semibold text-gray-900">{acc.company_name || '—'}</p>
                        <p className="text-xs text-gray-400 font-mono mt-0.5">{acc.account_code || ''}</p>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{acc.bank_name || '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                          acc.currency === 'AED' ? 'bg-emerald-100 text-emerald-700' :
                          acc.currency === 'USD' ? 'bg-blue-100 text-blue-700' :
                          'bg-purple-100 text-purple-700'
                        }`}>{acc.currency || '—'}</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {fmtDate(acc.last_transaction_date)}
                      </td>
                      <td className={`px-6 py-3 text-right font-mono font-semibold ${
                        !acc.closing_balance || Number(acc.closing_balance) === 0 ? 'text-gray-300' : 'text-gray-800'
                      }`}>
                        {fmt(Number(acc.closing_balance) || 0)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          acc.import_group === 'A' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
                        }`}>
                          {acc.import_group || '—'}
                        </span>
                      </td>
                      <td className="pr-4 py-3">
                        <ChevronRight size={14} className="text-gray-300" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </Layout>
  );
}
