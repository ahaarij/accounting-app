import { useState, useEffect, useCallback } from 'react';
import { Layout } from '../components/Layout';
import { getAuditLogs } from '../api';
import { RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';

interface AuditLog {
  id: number;
  user_email: string | null;
  user_name: string | null;
  entity_type: string;
  description: string;
  ip_address: string | null;
  created_at: string;
}

const ENTITY_TYPES = [
  { value: '', label: 'All' },
  { value: 'import', label: 'Import' },
  { value: 'reconciliation', label: 'Reconciliation' },
  { value: 'cash_deposit', label: 'Cash Deposits' },
  { value: 'company_profile', label: 'Company Profiles' },
  { value: 'buyer_supplier', label: 'Buyers/Suppliers' },
  { value: 'user', label: 'Users' },
  { value: 'bank_statement', label: 'Bank Statements' },
  { value: 'other', label: 'Other' },
];

const TYPE_STYLES: Record<string, string> = {
  import:          'bg-violet-100 text-violet-700',
  reconciliation:  'bg-blue-100 text-blue-700',
  cash_deposit:    'bg-emerald-100 text-emerald-700',
  company_profile: 'bg-amber-100 text-amber-700',
  buyer_supplier:  'bg-orange-100 text-orange-700',
  user:            'bg-rose-100 text-rose-700',
  bank_statement:  'bg-sky-100 text-sky-700',
  other:           'bg-gray-100 text-gray-600',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
}

export default function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [entityFilter, setEntityFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const LIMIT = 100;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await getAuditLogs(page, LIMIT, entityFilter || undefined);
      setLogs(res.data.logs);
      setTotal(res.data.total);
    } finally {
      setLoading(false);
    }
  }, [page, entityFilter]);

  useEffect(() => { load(); }, [load]);

  function handleFilterChange(val: string) {
    setEntityFilter(val);
    setPage(1);
  }

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <Layout>
      <div className="p-6 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Audit Logs</h1>
            <p className="text-xs text-gray-400 mt-0.5">{total} total entries</p>
          </div>
          <button
            onClick={load}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {ENTITY_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => handleFilterChange(value)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-full border transition-colors',
                entityFilter === value
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'text-gray-500 border-gray-200 hover:border-gray-400',
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
          ) : logs.length === 0 ? (
            <div className="py-16 text-center text-sm text-gray-400">No log entries found</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-44">Time</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-40">User</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-36">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/60">
                    <td className="px-4 py-3 text-xs text-gray-400 tabular-nums whitespace-nowrap">
                      {formatTime(log.created_at)}
                    </td>
                    <td className="px-4 py-3">
                      {log.user_name || log.user_email ? (
                        <div>
                          <p className="text-xs font-medium text-gray-800">{log.user_name || '—'}</p>
                          <p className="text-xs text-gray-400 truncate max-w-[150px]">{log.user_email}</p>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 italic">System</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', TYPE_STYLES[log.entity_type] ?? TYPE_STYLES.other)}>
                        {log.entity_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Page {page} of {totalPages}</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Previous
              </button>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50"
              >
                Next
              </button>
            </div>
          </div>
        )}

      </div>
    </Layout>
  );
}
