import { useEffect, useState, useRef } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { Plus, X, Landmark, Tag, Check, GripVertical } from 'lucide-react';

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

export default function AppSettings() {
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
