import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader, CardBody } from '../components/ui/card';
import {
  getSuspenseTransactions,
  getExcelSuspenseTransactions,
  classifySuspenseTransaction,
  getSuspenseRules,
  deleteSuspenseRule,
} from '../api';
import { HelpCircle, Check, Trash2, BookMarked, RefreshCw } from 'lucide-react';
import { SUSPENSE_CATEGORIES } from '../components/ClassifySuspenseModal';

const CATEGORY_OPTIONS = SUSPENSE_CATEGORIES;

function SourceBadge({ source }: { source: string }) {
  return source === 'excel' ? (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-700">Excel</span>
  ) : (
    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">Statement</span>
  );
}

const fmtNum = (v: any) =>
  v == null ? '' : Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = (d: string) => {
  if (!d) return '—';
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

interface DraftState { label: string; type: string; similar: boolean }

export default function SuspenseReview() {
  const location = useLocation();
  const isExcelMode = location.pathname === '/transactions-suspense';

  const [txs, setTxs] = useState<any[]>([]);
  const [rules, setRules] = useState<any[]>([]);
  // Keyed by "source:id" — statement and excel transactions have independent id spaces
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const fetchFn = isExcelMode ? getExcelSuspenseTransactions : getSuspenseTransactions;
      const [txRes, ruleRes] = await Promise.all([fetchFn(), getSuspenseRules()]);
      setTxs(txRes.data);
      setRules(ruleRes.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [isExcelMode]);

  const keyOf = (tx: any) => `${tx.source}:${tx.id}`;
  const draftFor = (key: string): DraftState => drafts[key] ?? { label: '', type: '', similar: true };
  const setDraft = (key: string, patch: Partial<DraftState>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...draftFor(key), ...patch } }));

  const similarCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of txs) {
      const key = String(t.description ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [txs]);

  const handleSave = async (tx: any) => {
    const d = draftFor(keyOf(tx));
    if (!d.type) { setMsg('Pick a category first'); setTimeout(() => setMsg(''), 2500); return; }
    setSavingId(keyOf(tx));
    try {
      const res = await classifySuspenseTransaction(tx.source, tx.id, {
        transaction_type: d.type,
        label: d.label || undefined,
        apply_to_similar: d.similar,
      });
      setMsg(`Classified ${res.data.updated} transaction${res.data.updated === 1 ? '' : 's'}${res.data.rule_saved ? ' — rule saved for future imports' : ''}`);
      setTimeout(() => setMsg(''), 4000);
      await load();
    } catch (e: any) {
      setMsg(e?.response?.data?.message ?? 'Failed to save');
      setTimeout(() => setMsg(''), 4000);
    } finally {
      setSavingId(null);
    }
  };

  const handleDeleteRule = async (id: number) => {
    await deleteSuspenseRule(id);
    setRules((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <Layout>
      <PageHeader
        title="Suspense Review"
        subtitle={isExcelMode
          ? 'Unrecognised transaction entries — give each one a name and a category. Matching entries are remembered for future imports.'
          : 'Unrecognised bank statement entries — give each one a name and a category. Matching entries are remembered for future imports.'}
      />
      <div className="p-8 space-y-6">

        {msg && (
          <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg text-sm">{msg}</div>
        )}

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                <HelpCircle size={16} className="text-yellow-500" />
                <h3 className="font-semibold text-gray-900 text-sm">
                  Suspense transactions
                  <span className="ml-2 text-xs font-normal text-gray-400">{txs.length} to review</span>
                </h3>
              </div>
              <button onClick={load} className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600" title="Refresh">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {txs.length === 0 && !loading ? (
              <div className="px-6 py-10 text-center text-sm text-gray-400">
                Nothing to review — every imported transaction has a category.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-2.5 font-medium">Date</th>
                      <th className="px-4 py-2.5 font-medium">Account</th>
                      <th className="px-4 py-2.5 font-medium">Statement entry</th>
                      <th className="px-4 py-2.5 font-medium text-right">Debit</th>
                      <th className="px-4 py-2.5 font-medium text-right">Credit</th>
                      <th className="px-4 py-2.5 font-medium">Name it</th>
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5 font-medium">Similar</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {txs.map((tx) => {
                      const rowKey = keyOf(tx);
                      const d = draftFor(rowKey);
                      const descKey = String(tx.description ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
                      const nSimilar = similarCount.get(descKey) ?? 1;
                      return (
                        <tr key={rowKey} className="hover:bg-gray-50/60 align-top">
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmtDate(tx.date)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1.5">
                              <SourceBadge source={tx.source} />
                              <span className="text-gray-900 text-xs font-medium leading-tight">{tx.company_name}</span>
                            </div>
                            <div className="text-[11px] text-gray-400 mt-0.5">{tx.bank_name} · {tx.currency}</div>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <div className="text-xs text-gray-700 break-words" title={tx.description}>{tx.description || '—'}</div>
                            {tx.ref && <div className="text-[10px] text-gray-400 font-mono mt-0.5 truncate" title={tx.ref}>{tx.ref}</div>}
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-red-600 whitespace-nowrap">{fmtNum(tx.debit)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-green-600 whitespace-nowrap">{fmtNum(tx.credit)}</td>
                          <td className="px-4 py-3">
                            <input
                              type="text"
                              value={d.label}
                              onChange={(e) => setDraft(rowKey, { label: e.target.value })}
                              placeholder="e.g. Rent — Marina office"
                              className="w-44 px-2 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3">
                            <select
                              value={d.type}
                              onChange={(e) => setDraft(rowKey, { type: e.target.value })}
                              className="w-40 px-2 py-1.5 text-xs border border-gray-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              <option value="">Choose…</option>
                              {CATEGORY_OPTIONS.map((o) => (
                                <option key={o.value} value={o.value}>{o.label}</option>
                              ))}
                            </select>
                          </td>
                          <td className="px-4 py-3">
                            <label className="flex items-center gap-1.5 text-[11px] text-gray-500 whitespace-nowrap cursor-pointer" title="Also classify every suspense entry with this exact description, and remember it for future imports">
                              <input
                                type="checkbox"
                                checked={d.similar}
                                onChange={(e) => setDraft(rowKey, { similar: e.target.checked })}
                                className="rounded border-gray-300"
                              />
                              all {nSimilar > 1 ? `${nSimilar} matching` : 'future'}
                            </label>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleSave(tx)}
                              disabled={savingId === rowKey || !d.type}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              <Check size={12} />{savingId === rowKey ? 'Saving…' : 'Save'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <BookMarked size={16} className="text-blue-500" />
              <h3 className="font-semibold text-gray-900 text-sm">
                Remembered classifications
                <span className="ml-2 text-xs font-normal text-gray-400">applied automatically to future imports</span>
              </h3>
            </div>
          </CardHeader>
          <CardBody className="p-0">
            {rules.length === 0 ? (
              <div className="px-6 py-8 text-center text-sm text-gray-400">
                No rules yet — save a classification with “apply to similar” ticked to create one.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                      <th className="px-4 py-2.5 font-medium">Statement text</th>
                      <th className="px-4 py-2.5 font-medium">Name</th>
                      <th className="px-4 py-2.5 font-medium">Category</th>
                      <th className="px-4 py-2.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rules.map((r) => (
                      <tr key={r.id} className="hover:bg-gray-50/60">
                        <td className="px-4 py-2.5 text-xs text-gray-600 max-w-md break-words">{r.match_text}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-900 font-medium">{r.label || '—'}</td>
                        <td className="px-4 py-2.5 text-xs text-gray-600">
                          {CATEGORY_OPTIONS.find((o) => o.value === r.transaction_type)?.label ?? r.transaction_type}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => handleDeleteRule(r.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                            title="Delete rule (already-classified transactions keep their category)"
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
