import { useState } from 'react';
import { classifySuspenseTransaction } from '../api';
import { X, Check } from 'lucide-react';

// Categories a suspense entry can be reassigned to (same set the parsers emit)
export const SUSPENSE_CATEGORIES: Array<{ value: string; label: string }> = [
  { value: 'INWARD_TRANSFER',       label: 'Inward Transfer' },
  { value: 'OUTWARD_TRANSFER',      label: 'Outward Transfer' },
  { value: 'OUTWARD_INTERNATIONAL', label: 'International Transfer' },
  { value: 'INTERNAL_TRANSFER',     label: 'Internal Transfer' },
  { value: 'CASH_DEPOSIT',          label: 'Cash Deposit' },
  { value: 'FX_CONVERSION',         label: 'FX Conversion' },
  { value: 'BANK_CHARGE',           label: 'Bank Charge' },
  { value: 'VAT_CHARGE',            label: 'VAT Charge' },
  { value: 'MONTHLY_CHARGE',        label: 'Monthly Fee' },
  { value: 'CHEQUE_PAID',           label: 'Cheque Paid' },
  { value: 'RETURNED_CHEQUE',       label: 'Returned Cheque' },
  { value: 'OTHER',                 label: 'Other' },
];

export interface ClassifyTarget {
  id: number;
  source: 'statement' | 'excel';
  description?: string | null;
  date?: string | null;
  debit?: number | string | null;
  credit?: number | string | null;
}

const fmtAmt = (v: any) =>
  v == null ? null : Number(v).toLocaleString('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function ClassifySuspenseModal({
  tx, onClose, onSaved,
}: {
  tx: ClassifyTarget;
  onClose: () => void;
  onSaved: (result: { updated: number; rule_saved: boolean }) => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState('');
  const [similar, setSimilar] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSave = async () => {
    if (!type) { setError('Pick a category'); return; }
    setSaving(true);
    setError('');
    try {
      const res = await classifySuspenseTransaction(tx.source, tx.id, {
        transaction_type: type,
        label: label || undefined,
        apply_to_similar: similar,
      });
      onSaved(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-900 text-sm">Classify suspense entry</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* The actual statement entry, as imported */}
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-2.5">
            <p className="text-xs text-gray-700 break-words">{tx.description || '(no description)'}</p>
            <div className="flex items-center gap-3 mt-1.5 text-[11px] font-mono">
              {tx.date && <span className="text-gray-400">{String(tx.date).slice(0, 10)}</span>}
              {tx.debit != null && <span className="text-red-600">−{fmtAmt(tx.debit)}</span>}
              {tx.credit != null && <span className="text-green-600">+{fmtAmt(tx.credit)}</span>}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">What should it be called?</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Rent — Marina office"
              autoFocus
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Choose a category…</option>
              {SUSPENSE_CATEGORIES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>

          <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={similar}
              onChange={(e) => setSimilar(e.target.checked)}
              className="mt-0.5 rounded border-gray-300"
            />
            <span>
              Apply to every suspense entry with this exact description — across statements and
              Excel sheets — and remember it for future imports
            </span>
          </label>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-sm rounded-lg text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !type}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Check size={14} />{saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
