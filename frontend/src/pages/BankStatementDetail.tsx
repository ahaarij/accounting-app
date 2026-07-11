import { useEffect, useState } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { getCsvTransactions } from '../api';
import { fmtDate } from '../utils/format';
import { ArrowLeft, Search, ChevronDown, ChevronRight } from 'lucide-react';
import ClassifySuspenseModal, { ClassifyTarget } from '../components/ClassifySuspenseModal';

function fmtNum(v: any) {
  if (v == null || v === '') return '—';
  return Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2 });
}

const BANK_COLORS: Record<string, string> = {
  // ADIB:    'bg-purple-100 text-purple-700',
  // FAB:     'bg-blue-100 text-blue-700',
  // FAB_NEW: 'bg-blue-100 text-blue-700',
  // WIO:     'bg-teal-100 text-teal-700',
  // ENBD:    'bg-red-100 text-red-700',
  // EIB:     'bg-green-100 text-green-700',
  // NBF:     'bg-orange-100 text-orange-700',
  // MASHREQ: 'bg-pink-100 text-pink-700',
  // UBL:     'bg-indigo-100 text-indigo-700',
  // ADCB:    'bg-cyan-100 text-cyan-700',
  // RAKBANK: 'bg-rose-100 text-rose-700',
};

const TYPE_COLORS: Record<string, string> = {
  CASH_DEPOSIT:         'bg-emerald-100 text-emerald-700',
  INWARD_TRANSFER:      'bg-blue-100 text-blue-700',
  OUTWARD_TRANSFER:     'bg-red-100 text-red-700',
  OUTWARD_INTERNATIONAL:'bg-rose-100 text-rose-700',
  INTERNAL_TRANSFER:    'bg-gray-100 text-gray-600',
  FX_CONVERSION:        'bg-amber-100 text-amber-700',
  BANK_CHARGE:          'bg-orange-100 text-orange-700',
  VAT_CHARGE:           'bg-orange-100 text-orange-700',
  MONTHLY_CHARGE:       'bg-orange-100 text-orange-700',
  CHEQUE_PAID:          'bg-slate-100 text-slate-600',
  RETURNED_CHEQUE:      'bg-slate-100 text-slate-600',
  SUSPENSE:             'bg-yellow-100 text-yellow-700',
  OTHER:                'bg-gray-100 text-gray-500',
};

const TYPE_LABELS: Record<string, string> = {
  CASH_DEPOSIT:         'Cash Deposit',
  INWARD_TRANSFER:      'Inward',
  OUTWARD_TRANSFER:     'Outward',
  OUTWARD_INTERNATIONAL:'Intl Transfer',
  INTERNAL_TRANSFER:    'Internal',
  FX_CONVERSION:        'FX',
  BANK_CHARGE:          'Charge',
  VAT_CHARGE:           'VAT',
  MONTHLY_CHARGE:       'Monthly Fee',
  CHEQUE_PAID:          'Cheque',
  RETURNED_CHEQUE:      'Returned',
  SUSPENSE:             'Suspense',
  OTHER:                'Other',
};

function BankBadge({ bank }: { bank: string }) {
  if (!bank) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold leading-none ${BANK_COLORS[bank] ?? 'bg-gray-100 text-gray-500'}`}>
      {bank}
    </span>
  );
}

function TypeBadge({ type }: { type: string }) {
  if (!type) return null;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium leading-none ${TYPE_COLORS[type] ?? 'bg-gray-100 text-gray-500'}`}>
      {TYPE_LABELS[type] ?? type}
    </span>
  );
}

function ChargeRow({ charge }: { charge: any }) {
  return (
    <tr className="bg-orange-50/60 border-b border-orange-100">
      <td className="pl-12 pr-3 py-2 text-gray-400 text-xs whitespace-nowrap">{fmtDate(charge.date)}</td>
      <td className="px-3 py-2" colSpan={2}>
        <div className="flex items-center gap-2">
          <TypeBadge type={charge.transaction_type} />
          <span className="text-xs text-gray-500 truncate max-w-xs">{charge.description || '—'}</span>
        </div>
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs text-red-500 whitespace-nowrap">
        {charge.debit != null ? fmtNum(charge.debit) : ''}
      </td>
      <td className="px-3 py-2 text-right font-mono text-xs text-green-600 whitespace-nowrap">
        {charge.credit != null ? fmtNum(charge.credit) : ''}
      </td>
      <td className="px-3 py-2" />
    </tr>
  );
}

const CHARGE_TYPE_SET = new Set(['BANK_CHARGE', 'VAT_CHARGE', 'MONTHLY_CHARGE']);

function isSuspenseTx(tx: any) {
  return !tx.counterparty && !tx.custom_label && !tx.is_charge && !CHARGE_TYPE_SET.has(tx.transaction_type);
}

function TxRow({ tx, onClassify }: { tx: any; onClassify?: (tx: any) => void }) {
  const [expanded, setExpanded] = useState(false);
  const hasCharges = tx.charges && tx.charges.length > 0;
  const suspense = isSuspenseTx(tx);

  return (
    <>
      <tr className={`hover:bg-gray-50 ${hasCharges ? 'cursor-pointer' : ''}`}
          onClick={hasCharges ? () => setExpanded(e => !e) : undefined}>
        <td className="px-4 py-3 text-gray-500 text-sm whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {hasCharges ? (
              expanded ? <ChevronDown size={13} className="text-gray-400 shrink-0" /> : <ChevronRight size={13} className="text-gray-400 shrink-0" />
            ) : <span className="w-3.5" />}
            {fmtDate(tx.date)}
          </div>
        </td>
        <td className="px-4 py-3">
          <div className="flex flex-col gap-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              {tx.bank_detected && <BankBadge bank={tx.bank_detected} />}
              {tx.transaction_type && (
                suspense && onClassify ? (
                  <button
                    onClick={(e) => { e.stopPropagation(); onClassify(tx); }}
                    title="Unclassified — click to name and categorise"
                    className="cursor-pointer hover:ring-2 hover:ring-yellow-300 rounded transition-shadow"
                  >
                    <TypeBadge type="SUSPENSE" />
                  </button>
                ) : (
                  <TypeBadge type={suspense ? 'SUSPENSE' : tx.transaction_type} />
                )
              )}
            </div>
            {(tx.custom_label || tx.counterparty) && (
              <span className="font-semibold text-gray-900 text-sm leading-tight truncate max-w-sm" title={tx.custom_label || tx.counterparty}>
                {tx.custom_label || tx.counterparty}
              </span>
            )}
            {tx.description && (
              <span className="text-xs text-gray-400 truncate max-w-sm" title={tx.description}>
                {tx.description}
              </span>
            )}
            {tx.fx_original_amount && (
              <span className="text-[11px] text-amber-600 font-mono">
                {tx.fx_original_currency} {fmtNum(tx.fx_original_amount)}
                {tx.fx_rate ? ` @ ${tx.fx_rate}` : ''}
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-gray-400 font-mono text-xs whitespace-nowrap max-w-[140px]">
          <span className="block truncate" title={tx.ref}>{tx.ref || '—'}</span>
        </td>
        <td className="px-4 py-3 text-right font-mono whitespace-nowrap">
          {tx.debit != null ? (
            <div className="flex flex-col items-end leading-tight">
              <span className="font-semibold text-red-600">{fmtNum(tx.debit)}</span>
              {hasCharges && (() => {
                const feeTotal = tx.charges.reduce((s: number, c: any) => s + (c.debit ?? 0), 0);
                return feeTotal > 0 ? (
                  <span className="text-[11px] text-orange-500 font-normal">+{fmtNum(feeTotal)} fees</span>
                ) : null;
              })()}
            </div>
          ) : ''}
        </td>
        <td className="px-4 py-3 text-right font-mono font-semibold text-green-600 whitespace-nowrap">
          {tx.credit != null ? fmtNum(tx.credit) : ''}
        </td>
        <td className="px-4 py-3 text-right font-mono text-gray-700 whitespace-nowrap">
          {fmtNum(tx.balance)}
        </td>
      </tr>
      {expanded && hasCharges && tx.charges.map((c: any) => <ChargeRow key={c.id} charge={c} />)}
    </>
  );
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
  const [classifyTx, setClassifyTx] = useState<ClassifyTarget | null>(null);

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
        (t.counterparty ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (t.ref ?? '').toLowerCase().includes(search.toLowerCase()),
      )
    : transactions;

  const suspenseCount = transactions.filter(isSuspenseTx).length;
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
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-4">
            <p className="text-2xl font-bold text-gray-900 font-mono">{total.toLocaleString()}</p>
            <p className="text-xs text-gray-500 mt-0.5">Total transactions</p>
          </div>
          <div className={`rounded-xl border px-6 py-4 ${suspenseCount > 0 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
            <p className={`text-2xl font-bold font-mono ${suspenseCount > 0 ? 'text-yellow-700' : 'text-gray-900'}`}>{suspenseCount.toLocaleString()}</p>
            <p className={`text-xs mt-0.5 ${suspenseCount > 0 ? 'text-yellow-600' : 'text-gray-500'}`}>Suspense transactions</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white px-6 py-4">
            <p className="text-2xl font-bold text-gray-900 font-mono">{latestBalance != null ? fmtNum(latestBalance.toFixed(2)) : '—'}</p>
            <p className="text-xs text-gray-500 mt-0.5">Latest balance</p>
          </div>
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
                    placeholder="Search counterparty / description / ref..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="border border-gray-300 rounded-lg pl-8 pr-3 py-1.5 text-sm w-72 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </CardHeader>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap">Date</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">Details</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500">Reference</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Debit</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Credit</th>
                  <th className="px-4 py-3 text-xs font-medium text-gray-500 text-right">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400 text-sm">Loading…</td></tr>
                )}
                {!loading && displayed.map((t: any) => (
                  <TxRow key={t.id} tx={t}
                    onClassify={(tx) => setClassifyTx({
                      id: tx.id, source: 'statement',
                      description: tx.description, date: tx.date, debit: tx.debit, credit: tx.credit,
                    })} />
                ))}
                {!loading && page === pages && !search && transactions.length > 0 && (() => {
                  const earliest = transactions[transactions.length - 1];
                  const openingBal = Number(earliest.balance ?? 0)
                    - Number(earliest.credit ?? 0)
                    + Number(earliest.debit ?? 0);
                  return (
                    <tr className="bg-gray-50 border-t-2 border-gray-200">
                      <td className="px-4 py-3 text-gray-400 text-xs italic whitespace-nowrap pl-9">{fmtDate(earliest.date)}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs italic font-medium">Opening Balance</td>
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3" />
                      <td className="px-4 py-3 text-right font-mono font-semibold text-gray-700 whitespace-nowrap">
                        {fmtNum(openingBal.toFixed(2))}
                      </td>
                    </tr>
                  );
                })()}
                {!loading && displayed.length === 0 && (
                  <tr><td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    {search ? `No transactions matching "${search}"` : 'No transactions'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>

          {pages > 1 && (
            <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 text-sm text-gray-500">
              <span>Page {page} of {pages}</span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => load(page - 1)} disabled={page <= 1 || loading}>Previous</Button>
                <Button variant="ghost" size="sm" onClick={() => load(page + 1)} disabled={page >= pages || loading}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {classifyTx && (
        <ClassifySuspenseModal
          tx={classifyTx}
          onClose={() => setClassifyTx(null)}
          onSaved={() => { setClassifyTx(null); load(page); }}
        />
      )}
    </Layout>
  );
}
