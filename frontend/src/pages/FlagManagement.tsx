import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { getFlags, resolveFlag } from '../api';
import { useAuth } from '../auth/AuthContext';
import { CheckCircle, Calendar, ExternalLink } from 'lucide-react';
import { fmtDate } from '../utils/format';

const FLAG_DESTINATIONS: Record<string, string> = {
  missing_invoice: '/cash-ledger',
  intergroup_mismatch: '/cash-ledger',
  file_completeness: '/import',
};

export default function FlagManagement() {
  const { isViewer } = useAuth();
  const navigate = useNavigate();
  const [flags, setFlags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState('');
  const [showResolved, setShowResolved] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});

  const load = async () => {
    setLoading(true);
    try {
      const res = await getFlags(date || undefined, showResolved ? undefined : false);
      setFlags(res.data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [date, showResolved]);

  const handleResolve = async (id: number) => {
    setResolvingId(id);
    try {
      await resolveFlag(id, notes[id]);
      setFlags((prev) => prev.filter((f) => f.id !== id));
    } finally { setResolvingId(null); }
  };

  const goToFlag = (flag: any) => {
    const dest = FLAG_DESTINATIONS[flag.flag_type];
    if (dest === '/cash-ledger') {
      navigate('/cash-ledger', {
        state: { highlightTransactionId: flag.daily_transaction_id, highlightDate: flag.date, severity: flag.severity, description: flag.description },
      });
      return;
    }
    if (dest) { navigate(dest); return; }
    if (flag.bank_account_id) {
      const breakMatch = flag.description?.match(/— "([^"]+)":/);
      const highlightParticular = breakMatch?.[1];
      navigate(`/accounts/${flag.bank_account_id}`, {
        state: { highlightDate: flag.date, highlightParticular, severity: flag.severity, description: flag.description },
      });
    }
  };

  const severityGroups = ['critical', 'warning', 'info'] as const;

  return (
    <Layout>
      <PageHeader title="Flag Management" subtitle="Review and resolve reconciliation flags" />
      <div className="p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Calendar size={15} className="text-gray-400" />
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} className="rounded" />
            Show resolved
          </label>
          <span className="text-sm text-gray-400">{flags.length} flags</span>
        </div>

        {severityGroups.map((severity) => {
          const group = flags.filter((f) => f.severity === severity);
          if (group.length === 0) return null;
          return (
            <Card key={severity}>
              <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                <Badge label={severity} variant={severity} />
                <span className="text-sm text-gray-500">{group.length} flag{group.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="divide-y divide-gray-100">
                {group.map((flag: any) => {
                  const hasAccountLink = flag.bank_account_id && !FLAG_DESTINATIONS[flag.flag_type];
                  const hasDest = flag.bank_account_id || FLAG_DESTINATIONS[flag.flag_type];
                  const leftBorder = severity === 'critical' ? 'border-l-4 border-red-400' : severity === 'warning' ? 'border-l-4 border-amber-400' : 'border-l-4 border-blue-300';
                  return (
                    <div key={flag.id} className={`px-6 py-4 ${leftBorder}`}>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">{flag.flag_type}</span>
                            <span className="text-xs text-gray-400">{fmtDate(flag.date)}</span>
                            {flag.resolved && <span className="text-xs text-green-600 font-medium">Resolved</span>}
                          </div>
                          <p className="text-sm text-gray-800">{flag.description}</p>
                          {hasDest && (
                            <button onClick={() => goToFlag(flag)}
                              className="mt-1 flex items-center gap-1 text-xs text-blue-600 hover:underline">
                              <ExternalLink size={11} />
                              {hasAccountLink
                                ? `${flag.account_name ?? 'Account #' + flag.bank_account_id}${flag.account_code ? ' · ' + flag.account_code : ''}`
                                : FLAG_DESTINATIONS[flag.flag_type] === '/import' ? 'Go to Import' : 'Go to Cash Ledger'}
                            </button>
                          )}
                        </div>
                        {!isViewer && !flag.resolved && (
                          <div className="flex items-center gap-2 shrink-0">
                            <input type="text" placeholder="Notes (optional)"
                              value={notes[flag.id] ?? ''}
                              onChange={(e) => setNotes((n) => ({ ...n, [flag.id]: e.target.value }))}
                              className="border border-gray-300 rounded-lg px-3 py-1.5 text-xs w-40 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                            <Button size="sm" variant="secondary" loading={resolvingId === flag.id} onClick={() => handleResolve(flag.id)}>
                              <CheckCircle size={13} /> Resolve
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          );
        })}

        {!loading && flags.length === 0 && (
          <div className="text-center py-16">
            <CheckCircle size={36} className="text-green-400 mx-auto mb-3" />
            <p className="text-gray-500 font-medium">No flags to show</p>
            <p className="text-sm text-gray-400 mt-1">All clear for the selected filters</p>
          </div>
        )}
      </div>
    </Layout>
  );
}
