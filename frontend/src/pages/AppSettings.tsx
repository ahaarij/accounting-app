import { useEffect, useState, useRef } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { Plus, X, Landmark, Tag, Check, GripVertical, Mail, Send } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { getAppSettings, saveAppSettings, sendTestEmail } from '../api';

function loadList(key: string, defaults: string[]): string[] {
  try {
    const v = localStorage.getItem(key);
    if (v) return JSON.parse(v);
  } catch {}
  return defaults;
}

function persistList(key: string, list: string[]) {
  localStorage.setItem(key, JSON.stringify(list.filter(s => s.trim())));
}

const DEFAULT_BANKS = [
  'NBF', 'SIB', 'ADIB', 'WIO', 'MASHREQ', 'MASHREQ NEO',
  'ENBD', 'FAB', 'EIB', 'ADCB', 'RAK', 'UBL',
  'SCB', 'LIV', 'HBZ', 'INDUS IND', 'BANQUE MISR',
];
const DEFAULT_CATEGORIES = ['General Trading', 'Logistics', 'IT', 'Real Estate', 'Manufacturing', 'Retail', 'Services', 'Offshore'];

interface ListEditorProps {
  label: string;
  description: string;
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  items: string[];
  setItems: (fn: (prev: string[]) => string[]) => void;
  placeholder: string;
  savedKey: string;
}

function ListEditor({ label, description, icon: Icon, iconBg, iconColor, items, setItems, placeholder, savedKey }: ListEditorProps) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const newInputRef = useRef<HTMLInputElement | null>(null);

  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      persistList(savedKey, items);
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }, 300);
  };

  const handleAdd = () => {
    setItems(l => [...l, '']);
    setTimeout(() => newInputRef.current?.focus(), 50);
  };

  const filled = items.filter(s => s.trim()).length;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0`}>
            <Icon size={18} className={iconColor} />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">{label}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs tabular-nums text-gray-400 bg-gray-50 border border-gray-200 px-2 py-1 rounded-lg">
            {filled} {filled === 1 ? 'entry' : 'entries'}
          </span>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 ${
              saved
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            } disabled:opacity-60`}
          >
            {saved ? (
              <><Check size={12} /> Saved</>
            ) : (
              saving ? 'Saving…' : 'Save'
            )}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="px-6 py-4">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 border-2 border-dashed border-gray-200 rounded-xl">
            <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center mb-3`}>
              <Icon size={16} className={iconColor} />
            </div>
            <p className="text-sm font-medium text-gray-500">No entries yet</p>
            <p className="text-xs text-gray-400 mt-0.5">Click "Add entry" below to get started</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <div
                key={i}
                className="group flex items-center gap-2 px-3 py-2 rounded-xl border border-gray-100 bg-gray-50 hover:border-gray-200 hover:bg-white transition-all duration-150"
              >
                <GripVertical size={13} className="text-gray-300 flex-shrink-0 cursor-grab" />
                <span className="text-xs text-gray-300 tabular-nums w-4 text-right flex-shrink-0">{i + 1}</span>
                <input
                  ref={i === items.length - 1 ? newInputRef : undefined}
                  value={item}
                  onChange={e => setItems(l => l.map((v, j) => j === i ? e.target.value : v))}
                  placeholder={placeholder}
                  className="flex-1 text-sm bg-transparent focus:outline-none text-gray-800 placeholder-gray-300 min-w-0"
                />
                <button
                  type="button"
                  onClick={() => setItems(l => l.filter((_, j) => j !== i))}
                  className="opacity-0 group-hover:opacity-100 p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                >
                  <X size={13} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Add button */}
        <button
          type="button"
          onClick={handleAdd}
          className="mt-3 w-full flex items-center justify-center gap-1.5 text-xs text-gray-400 hover:text-blue-600 py-2.5 rounded-xl border-2 border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-150"
        >
          <Plus size={13} />
          Add entry
        </button>
      </div>
    </div>
  );
}

interface SmtpField { key: string; label: string; type?: string; placeholder: string; hint?: string }
const SMTP_FIELDS: SmtpField[] = [
  { key: 'smtp_host',       label: 'SMTP Host',      placeholder: 'smtp.gmail.com' },
  { key: 'smtp_port',       label: 'SMTP Port',      placeholder: '587',           hint: '587 = TLS (recommended), 465 = SSL' },
  { key: 'smtp_user',       label: 'Username',       placeholder: 'you@gmail.com' },
  { key: 'smtp_pass',       label: 'Password',       type: 'password', placeholder: '(unchanged)' },
  { key: 'smtp_from_name',  label: 'From Name',      placeholder: 'Reconciliation App' },
  { key: 'smtp_from_email', label: 'From Email',     placeholder: 'noreply@yourcompany.ae', hint: 'Leave blank to use username' },
];

function SmtpSettings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [testErr, setTestErr] = useState('');

  useEffect(() => {
    getAppSettings()
      .then(res => {
        const init: Record<string, string> = {};
        for (const f of SMTP_FIELDS) init[f.key] = res.data[f.key] ?? '';
        setValues(init);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true); setSaved(false);
    try {
      // Send the password only if the user typed something (non-empty, not the placeholder sentinel)
      const payload: Record<string, string> = {};
      for (const f of SMTP_FIELDS) {
        if (f.key === 'smtp_pass' && !values['smtp_pass']) continue; // keep existing pass
        payload[f.key] = values[f.key] ?? '';
      }
      await saveAppSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      /* ignore, could add toast */
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestMsg(''); setTestErr('');
    try {
      const res = await sendTestEmail();
      setTestMsg(res.data.message);
    } catch (e: any) {
      setTestErr(e?.response?.data?.message ?? 'Test failed — check SMTP settings.');
    } finally {
      setTesting(false);
    }
  };

  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-sm text-gray-400">Loading SMTP settings…</div>
  );

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center flex-shrink-0">
            <Mail size={18} className="text-sky-600" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Email (SMTP)</h2>
            <p className="text-xs text-gray-400 mt-0.5">Used for password reset emails</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleTest}
            disabled={testing}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <Send size={12} />{testing ? 'Sending…' : 'Test email'}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-all duration-200 ${
              saved ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-600 hover:bg-blue-700 text-white'
            } disabled:opacity-60`}
          >
            {saved ? <><Check size={12} /> Saved</> : saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="px-6 py-4 space-y-3">
        {testMsg && <div className="text-xs text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">{testMsg}</div>}
        {testErr && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{testErr}</div>}

        <div className="grid grid-cols-2 gap-3">
          {SMTP_FIELDS.map(f => (
            <div key={f.key} className={f.key === 'smtp_host' ? 'col-span-2' : ''}>
              <label className="block text-xs font-medium text-gray-600 mb-1">{f.label}</label>
              <input
                type={f.type ?? 'text'}
                value={values[f.key] ?? ''}
                onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.key === 'smtp_pass' && values['smtp_pass'] === '' ? '(unchanged — leave blank to keep)' : f.placeholder}
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 focus:bg-white transition-colors"
              />
              {f.hint && <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <input
            type="checkbox"
            id="smtp_secure"
            checked={values['smtp_secure'] === 'true'}
            onChange={e => setValues(v => ({ ...v, smtp_secure: e.target.checked ? 'true' : 'false' }))}
            className="rounded border-gray-300"
          />
          <label htmlFor="smtp_secure" className="text-xs text-gray-600">Use SSL (port 465) — leave unchecked for STARTTLS on port 587</label>
        </div>
      </div>
    </div>
  );
}

export default function AppSettings() {
  const { user } = useAuth();
  const [bankNames, setBankNames] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  useEffect(() => {
    setBankNames(loadList('settings_bank_names', DEFAULT_BANKS));
    setCategories(loadList('settings_company_categories', DEFAULT_CATEGORIES));
  }, []);

  return (
    <Layout>
      <PageHeader
        title="Settings"
        subtitle="Manage reference data used across the app"
      />
      <div className="flex justify-center px-8 py-8">
        <div className="w-full max-w-2xl space-y-5">
          {/* Section label */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Reference Lists</p>
            {user?.role === 'super_admin' && (
            <div className="mb-5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Email Configuration</p>
              <SmtpSettings />
            </div>
          )}

          <div className="space-y-5">
              <ListEditor
                label="Bank Names"
                description="Used when assigning bank accounts to companies"
                icon={Landmark}
                iconBg="bg-blue-50"
                iconColor="text-blue-600"
                items={bankNames}
                setItems={setBankNames}
                placeholder="e.g. NBF"
                savedKey="settings_bank_names"
              />
              <ListEditor
                label="Company Categories"
                description="Business type labels shown on company profiles"
                icon={Tag}
                iconBg="bg-violet-50"
                iconColor="text-violet-600"
                items={categories}
                setItems={setCategories}
                placeholder="e.g. General Trading"
                savedKey="settings_company_categories"
              />
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
