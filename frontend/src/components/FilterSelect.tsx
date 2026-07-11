import { ChevronDown } from 'lucide-react';

export function FilterSelect({ value, onChange, options, placeholder }: {
  value: string;
  onChange: (v: string) => void;
  options: { label: string; value: string }[];
  placeholder: string;
}) {
  const active = !!value;
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`appearance-none pl-3 pr-7 py-1.5 text-xs rounded-lg border transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500
          ${active
            ? 'border-blue-300 bg-blue-50 text-blue-700 font-medium'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'}`}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown
        size={11}
        className={`absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none ${active ? 'text-blue-500' : 'text-gray-400'}`}
      />
    </div>
  );
}
