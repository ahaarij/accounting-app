import { useEffect, useRef, useState } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { Layout, PageHeader, Breadcrumb } from '../components/Layout';
import { Card, CardHeader, CardBody } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { getBankAccount, getBalanceWalk } from '../api';
import { ArrowLeft, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { fmtDate } from '../utils/format';

interface HighlightState {
  highlightDate?: string;
  highlightParticular?: string;
  severity?: 'critical' | 'warning' | 'info';
  description?: string;
  difference?: number;
}

const HIGHLIGHT_STYLES: Record<string, string> = {
  critical: 'bg-red-50 border-l-4 border-red-400',
  warning:  'bg-amber-50 border-l-4 border-amber-400',
  info:     'bg-blue-50 border-l-4 border-blue-400',
  default:  'bg-orange-50 border-l-4 border-orange-400',
};

const BANNER_STYLES: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-800',
  warning:  'bg-amber-50 border-amber-200 text-amber-800',
  info:     'bg-blue-50 border-blue-200 text-blue-800',
  default:  'bg-orange-50 border-orange-200 text-orange-800',
};

export default function AccountDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const highlight = (location.state as HighlightState) ?? {};

  const [account, setAccount] = useState<any>(null);
  const [txns, setTxns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const firstHighlightRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      getBankAccount(Number(id)),
      getBalanceWalk(Number(id), startDate || undefined, endDate || undefined),
    ]).then(([a, t]) => {
      setAccount(a.data);
      setTxns(t.data ?? []);
    }).finally(() => setLoading(false));
  }, [id, startDate, endDate]);

  // Scroll to first highlighted row after render
  useEffect(() => {
    if (!loading && highlight.highlightDate && firstHighlightRef.current) {
      setTimeout(() => firstHighlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [loading, highlight.highlightDate]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  if (!account) return <Layout><div className="p-8 text-gray-500">Account not found</div></Layout>;

  const name = account.account_name ?? account.accountName;
  const code = account.account_code ?? account.accountCode;
  const sev = highlight.severity ?? 'default';
  const bannerStyle = BANNER_STYLES[sev] ?? BANNER_STYLES.default;
  const rowStyle = HIGHLIGHT_STYLES[sev] ?? HIGHLIGHT_STYLES.default;

  let firstHighlightSet = false;

  return (
    <Layout>
      <Breadcrumb items={[{ label: 'Dashboard', to: '/' }, { label: name }]} />
      <PageHeader
        title={name}
        subtitle={[account.bank_name, account.currency && `(${account.currency})`, code && `· ${code}`].filter(Boolean).join(' ') || undefined}
        action={
          <Button variant="secondary" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} /> Back
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        {/* Highlight banner */}
        {highlight.highlightDate && (
          <div className={`flex items-start gap-3 border rounded-xl px-5 py-4 ${bannerStyle}`}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">
                {highlight.severity === 'critical' ? 'Critical issue' : highlight.severity === 'warning' ? 'Warning' : 'Notice'}
                {' '}· {fmtDate(highlight.highlightDate)}
              </p>
              {highlight.description && (
                <p className="text-xs mt-0.5 opacity-80">{highlight.description}</p>
              )}
              {highlight.difference != null && highlight.difference !== 0 && (
                <p className="text-xs mt-0.5 font-mono opacity-80">
                  Difference: {highlight.difference > 0 ? '+' : ''}{Number(highlight.difference).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Balance summary */}
        <div className="grid grid-cols-4 gap-4">
          {[
            { label: 'Opening Balance',    value: account.opening_balance    ?? account.openingBalance },
            { label: 'Total Deposits',     value: account.total_deposits     ?? account.totalDeposits },
            { label: 'Total Withdrawals',  value: account.total_withdrawals  ?? account.totalWithdrawals },
            { label: 'Closing Balance',    value: account.closing_balance    ?? account.closingBalance },
          ].map(({ label, value }) => (
            <Card key={label}>
              <CardBody>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-xl font-bold text-gray-900 mt-1 font-mono">
                  {Number(value ?? 0).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                </p>
              </CardBody>
            </Card>
          ))}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Badge label={account.status || 'active'} variant={account.status === 'active' ? 'success' : 'warning'} />
          <span className="text-gray-400">{account.currency || 'AED'}</span>
          {account.company && <span className="text-gray-400">· {account.company?.name}</span>}
        </div>

        {/* Transactions */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <p className="font-medium text-gray-900 text-sm">
                Transactions
                {txns.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({txns.length} rows)
                  </span>
                )}
                {highlight.highlightDate && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    — highlighted rows are on {fmtDate(highlight.highlightDate)}
                  </span>
                )}
              </p>
              <div className="flex items-center gap-2 text-sm">
                <label className="text-xs text-gray-500">From</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <label className="text-xs text-gray-500">To</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {(startDate || endDate) && (
                  <button
                    onClick={() => { setStartDate(''); setEndDate(''); }}
                    className="text-xs text-gray-400 hover:text-gray-600 underline"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500">Date</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500">Particular</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 text-right">Deposit</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 text-right">Withdrawal</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 text-right">Expected</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500 text-right">Recorded</th>
                </tr>
              </thead>
              <tbody>
                {txns.map((tx: any, i: number) => {
                  const expected = parseFloat(Number(tx.expected_balance ?? 0).toFixed(2));
                  const recorded = parseFloat(Number(tx.running_balance ?? 0).toFixed(2));
                  const isBroken = Math.abs(expected - recorded) > 0.01;

                  const dateMatch = highlight.highlightDate && tx.date?.slice(0, 10) === highlight.highlightDate;
                  const particularMatch = highlight.highlightParticular ? tx.particular === highlight.highlightParticular : true;
                  const isNavHighlight = dateMatch && particularMatch;
                  const isFirst = (isBroken || isNavHighlight) && !firstHighlightSet;
                  if (isFirst) firstHighlightSet = true;

                  const rowStyle = isBroken
                    ? 'bg-red-50 border-l-4 border-red-500'
                    : isNavHighlight
                      ? HIGHLIGHT_STYLES[highlight.severity ?? 'default']
                      : 'border-b border-gray-100 hover:bg-gray-50';
                  return (
                    <tr
                      key={i}
                      ref={isFirst ? firstHighlightRef : undefined}
                      className={rowStyle}
                    >
                      <td className="px-6 py-3 text-gray-500 whitespace-nowrap font-medium">
                        {fmtDate(tx.date)}
                        {isBroken && <span className="ml-2 text-red-500 text-xs font-bold">✕</span>}
                      </td>
                      <td className="px-6 py-3 text-gray-800 max-w-xs truncate">{tx.particular}</td>
                      <td className="px-6 py-3 text-right font-mono text-green-700">
                        {Number(tx.deposit ?? 0) > 0 ? Number(tx.deposit).toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-red-600">
                        {Number(tx.withdrawal ?? 0) > 0 ? Number(tx.withdrawal).toLocaleString('en-AE', { minimumFractionDigits: 2 }) : '—'}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-gray-700">
                        {expected.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                      </td>
                      <td className={`px-6 py-3 text-right font-mono font-semibold ${isBroken ? 'text-red-600' : 'text-gray-700'}`}>
                        {recorded.toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                        {isBroken && (
                          <span className="ml-2 text-xs font-normal text-red-500">
                            ({recorded > expected ? '+' : ''}{(recorded - expected).toLocaleString('en-AE', { minimumFractionDigits: 2 })})
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {txns.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">No transactions</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
