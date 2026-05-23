import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { getDailyTransactions, getCounterpartyLedger } from '../api';
import { AlertTriangle, Calendar, TrendingDown, TrendingUp } from 'lucide-react';

interface HighlightState {
  highlightTransactionId?: number;
  highlightDate?: string;
  severity?: 'critical' | 'warning' | 'info';
  description?: string;
}

const HIGHLIGHT_ROW: Record<string, string> = {
  critical: 'bg-red-50 border-l-4 border-red-400',
  warning:  'bg-amber-50 border-l-4 border-amber-400',
  info:     'bg-blue-50 border-l-4 border-blue-400',
  default:  'bg-orange-50 border-l-4 border-orange-400',
};

const BANNER: Record<string, string> = {
  critical: 'bg-red-50 border-red-200 text-red-800',
  warning:  'bg-amber-50 border-amber-200 text-amber-800',
  info:     'bg-blue-50 border-blue-200 text-blue-800',
  default:  'bg-orange-50 border-orange-200 text-orange-800',
};

function fmt(v: any) {
  const n = Number(v ?? 0);
  if (n === 0) return <span className="text-gray-300">—</span>;
  return <span>{n.toLocaleString('en-AE', { minimumFractionDigits: 2 })}</span>;
}

function groupByDate<T>(arr: T[], key: (item: T) => string): [string, T[]][] {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  }
  return Array.from(map.entries());
}

function fmtDay(day: string) {
  return new Date(day + 'T00:00:00').toLocaleDateString('en-AE', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function CashTradeLedger() {
  const location = useLocation();
  const hl = (location.state as HighlightState) ?? {};

  const [tab, setTab] = useState<'transactions' | 'counterparty'>('transactions');
  const [date, setDate] = useState(hl.highlightDate ?? '');
  const [transactions, setTransactions] = useState<any[]>([]);
  const [counterparty, setCounterparty] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const highlightRef = useRef<HTMLTableRowElement>(null);

  const load = async (d?: string) => {
    setLoading(true);
    try {
      const [t, c] = await Promise.all([
        getDailyTransactions((d ?? date) || undefined),
        getCounterpartyLedger((d ?? date) || undefined),
      ]);
      setTransactions(t.data);
      setCounterparty(c.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Scroll to highlighted row after data loads
  useEffect(() => {
    if (!loading && (hl.highlightTransactionId || hl.highlightDate) && highlightRef.current) {
      setTimeout(() => highlightRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    }
  }, [loading]);

  const txByDate = groupByDate(transactions, (t) => t.date);
  const cpByDate = groupByDate(counterparty, (c) => c.date);

  const toReceive = counterparty.filter((c) => c.status === 'owed_by_them');
  const toPay     = counterparty.filter((c) => c.status === 'owed_to_them');
  const sumAed = (arr: any[]) => arr.reduce((s, c) => s + Math.abs(Number(c.closing_balance_aed ?? 0)), 0);
  const sumUsd = (arr: any[]) => arr.reduce((s, c) => s + Math.abs(Number(c.closing_balance_usd ?? 0)), 0);

  const sev = hl.severity ?? 'default';
  const hlRowStyle = HIGHLIGHT_ROW[sev] ?? HIGHLIGHT_ROW.default;
  const bannerStyle = BANNER[sev] ?? BANNER.default;

  let firstRefSet = false;
  const isHighlightedTx = (tx: any): boolean => {
    if (hl.highlightTransactionId) return Number(tx.id) === Number(hl.highlightTransactionId);
    if (hl.highlightDate) return tx.date?.slice(0, 10) === hl.highlightDate;
    return false;
  };

  return (
    <Layout>
      <PageHeader title="Cash Trade Ledger" subtitle="Daily transactions and counterparty balances" />
      <div className="p-8 space-y-6">

        {/* Highlight banner */}
        {(hl.highlightTransactionId || hl.highlightDate) && (
          <div className={`flex items-start gap-3 border rounded-xl px-5 py-4 ${bannerStyle}`}>
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold">
                {hl.severity === 'critical' ? 'Critical issue' : hl.severity === 'warning' ? 'Warning' : 'Notice'}
                {hl.highlightDate && ` · ${hl.highlightDate}`}
              </p>
              {hl.description && <p className="text-xs mt-0.5 opacity-80">{hl.description}</p>}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          <Calendar size={16} className="text-gray-400" />
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <Button variant="secondary" size="sm" onClick={() => load(date)} loading={loading}>Filter</Button>
          {date && <Button variant="ghost" size="sm" onClick={() => { setDate(''); load(''); }}>Clear</Button>}
        </div>

        <div className="flex gap-1 border-b border-gray-200">
          {(['transactions', 'counterparty'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
              {t === 'transactions' ? `Daily Transactions (${transactions.length})` : `Counterparty Ledger (${counterparty.length})`}
            </button>
          ))}
        </div>

        {tab === 'transactions' && (
          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 text-left">
                    {['Type','Particulars','Source Bank','Beneficiary','Dest Bank','AED','USD','EUR','Invoice #','PI Ref','Transport Ref','Reference'].map((h) => (
                      <th key={h} className="px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {txByDate.length === 0 && !loading && (
                    <tr><td colSpan={12} className="px-6 py-8 text-center text-gray-400">No transactions found</td></tr>
                  )}
                  {txByDate.map(([day, rows]) => (
                    <>
                      <tr key={`hdr-${day}`} className="bg-slate-800">
                        <td colSpan={12} className="px-4 py-2 text-xs font-semibold text-slate-200 tracking-wide">
                          {fmtDay(day)}
                          <span className="ml-3 font-normal text-slate-400">{rows.length} transaction{rows.length !== 1 ? 's' : ''}</span>
                        </td>
                      </tr>
                      {rows.map((tx: any, i: number) => {
                        const highlighted = isHighlightedTx(tx);
                        const isFirst = highlighted && !firstRefSet;
                        if (isFirst) firstRefSet = true;
                        return (
                          <tr key={`${day}-${i}`}
                            ref={isFirst ? highlightRef : undefined}
                            className={highlighted ? hlRowStyle : 'border-b border-gray-100 hover:bg-gray-50'}>
                            <td className="px-4 py-2.5">
                              {tx.transaction_type
                                ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">{tx.transaction_type}</span>
                                : <span className="text-gray-300">—</span>}
                            </td>
                            <td className="px-4 py-2.5 text-gray-800 max-w-[200px] truncate" title={tx.particulars}>
                              {tx.particulars || <span className="text-gray-300">—</span>}
                              {highlighted && <span className="ml-2 inline-block w-1.5 h-1.5 rounded-full bg-current align-middle" />}
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">{tx.source_bank || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-gray-700 max-w-[160px] truncate" title={tx.beneficiary}>{tx.beneficiary || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-gray-500">{tx.destination_bank || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-right font-mono">{fmt(tx.amount_aed)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fmt(tx.amount_usd)}</td>
                            <td className="px-4 py-2.5 text-right font-mono text-purple-700">{fmt(tx.amount_eur)}</td>
                            <td className="px-4 py-2.5 text-gray-500 font-mono text-xs">{tx.invoice_number || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{tx.pi_reference || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{tx.transport_ref || <span className="text-gray-300">—</span>}</td>
                            <td className="px-4 py-2.5 text-gray-400 text-xs">{tx.reference || <span className="text-gray-300">—</span>}</td>
                          </tr>
                        );
                      })}
                      <tr key={`gap-${day}`}><td colSpan={12} className="h-3 bg-gray-50" /></tr>
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {tab === 'counterparty' && (
          <>
            {counterparty.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-xl px-6 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={16} className="text-green-600" />
                    <p className="text-sm font-semibold text-green-800">To Receive (Owed by them)</p>
                    <span className="text-xs text-green-600 ml-auto">{toReceive.length} counterpart{toReceive.length !== 1 ? 'ies' : 'y'}</span>
                  </div>
                  <p className="text-xs text-green-600 mb-0.5">AED</p>
                  <p className="text-2xl font-bold font-mono text-green-700">
                    {sumAed(toReceive).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                  </p>
                  {sumUsd(toReceive) > 0 && (
                    <>
                      <p className="text-xs text-green-600 mt-2 mb-0.5">USD</p>
                      <p className="text-lg font-bold font-mono text-green-700">
                        {sumUsd(toReceive).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </>
                  )}
                </div>
                <div className="bg-red-50 border border-red-200 rounded-xl px-6 py-4">
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingDown size={16} className="text-red-600" />
                    <p className="text-sm font-semibold text-red-800">To Pay (Owed to them)</p>
                    <span className="text-xs text-red-500 ml-auto">{toPay.length} counterpart{toPay.length !== 1 ? 'ies' : 'y'}</span>
                  </div>
                  <p className="text-xs text-red-500 mb-0.5">AED</p>
                  <p className="text-2xl font-bold font-mono text-red-700">
                    {sumAed(toPay).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                  </p>
                  {sumUsd(toPay) > 0 && (
                    <>
                      <p className="text-xs text-red-500 mt-2 mb-0.5">USD</p>
                      <p className="text-lg font-bold font-mono text-red-700">
                        {sumUsd(toPay).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </p>
                    </>
                  )}
                </div>
              </div>
            )}

            {counterparty.length > 0 && (() => {
              // Sum raw signed closing balances — negative = we owe them, positive = they owe us
              const netAed = counterparty.reduce((s, c) => s + Number(c.closing_balance_aed ?? 0), 0);
              const netUsd = counterparty.reduce((s, c) => s + Number(c.closing_balance_usd ?? 0), 0);
              const aedPay = netAed < 0;
              const usdPay = netUsd < 0;
              const borderCls = aedPay ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200';
              return (
                <div className={`border rounded-xl px-6 py-4 flex items-center justify-between ${borderCls}`}>
                  <div>
                    <p className={`text-sm font-semibold ${aedPay ? 'text-red-800' : 'text-green-800'}`}>
                      Net Position
                    </p>
                    <p className="text-xs text-gray-400 mt-0.5">Sum of all signed closing balances</p>
                  </div>
                  <div className="text-right space-y-1">
                    <p className={`text-2xl font-bold font-mono ${aedPay ? 'text-red-700' : 'text-green-700'}`}>
                      {aedPay ? '▼ ' : '▲ '}{Math.abs(netAed).toLocaleString('en-AE', { minimumFractionDigits: 2 })} AED
                      <span className={`ml-2 text-sm font-normal ${aedPay ? 'text-red-500' : 'text-green-500'}`}>
                        {aedPay ? 'net to pay' : 'net to receive'}
                      </span>
                    </p>
                    {Math.abs(netUsd) > 0.01 && (
                      <p className={`text-base font-mono ${usdPay ? 'text-red-600' : 'text-green-600'}`}>
                        {usdPay ? '▼ ' : '▲ '}{Math.abs(netUsd).toLocaleString('en-US', { minimumFractionDigits: 2 })} USD
                        <span className={`ml-2 text-xs font-normal ${usdPay ? 'text-red-400' : 'text-green-400'}`}>
                          {usdPay ? 'net to pay' : 'net to receive'}
                        </span>
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}

            <Card>
              <div className="overflow-x-auto">
                <table className="w-full text-sm whitespace-nowrap">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      {['Counterparty','Status','OB (AED)','OB (USD)','Inward','Outward','Commission','Closing (AED)','Closing (USD)'].map((h) => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-gray-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cpByDate.length === 0 && !loading && (
                      <tr><td colSpan={9} className="px-6 py-8 text-center text-gray-400">No counterparty data found</td></tr>
                    )}
                    {cpByDate.map(([day, rows]) => (
                      <>
                        <tr key={`hdr-${day}`} className="bg-slate-800">
                          <td colSpan={9} className="px-4 py-2 text-xs font-semibold text-slate-200 tracking-wide">
                            {fmtDay(day)}
                            <span className="ml-3 font-normal text-slate-400">{rows.length} counterpart{rows.length !== 1 ? 'ies' : 'y'}</span>
                          </td>
                        </tr>
                        {rows.map((cp: any, i: number) => {
                          const isReceive = cp.status === 'owed_by_them';
                          const isPay     = cp.status === 'owed_to_them';
                          const statusBadge = isReceive
                            ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700 border border-green-200">Owed by them</span>
                            : isPay
                            ? <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-200">Owed to them</span>
                            : <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500 border border-gray-200">Settled</span>;
                          return (
                            <tr key={`${day}-${i}`} className={`border-b border-gray-100 hover:brightness-95 ${isReceive ? 'bg-green-50/40' : isPay ? 'bg-red-50/40' : ''}`}>
                              <td className="px-4 py-2.5 font-medium text-gray-800">{cp.counterparty_name}</td>
                              <td className="px-4 py-2.5">{statusBadge}</td>
                              <td className="px-4 py-2.5 text-right font-mono">{fmt(cp.opening_balance_aed)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-blue-700">{fmt(cp.opening_balance_usd)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-green-700">{fmt(cp.inward_fund)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-red-600">{fmt(cp.outward_fund)}</td>
                              <td className="px-4 py-2.5 text-right font-mono text-amber-600">{fmt(cp.commission_aed)}</td>
                              <td className={`px-4 py-2.5 text-right font-mono font-semibold ${isReceive ? 'text-green-700' : isPay ? 'text-red-600' : 'text-gray-400'}`}>
                                {fmt(Math.abs(Number(cp.closing_balance_aed ?? 0)))}
                              </td>
                              <td className={`px-4 py-2.5 text-right font-mono ${isReceive ? 'text-green-600' : isPay ? 'text-red-500' : 'text-gray-400'}`}>
                                {fmt(Math.abs(Number(cp.closing_balance_usd ?? 0)))}
                              </td>
                            </tr>
                          );
                        })}
                        <tr key={`gap-${day}`}><td colSpan={9} className="h-3 bg-gray-50" /></tr>
                      </>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </>
        )}
      </div>
    </Layout>
  );
}
