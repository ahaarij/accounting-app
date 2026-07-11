import { useState, useEffect, useRef } from 'react';

export const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

export function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function fmtMonth(ym: string): string {
  if (!ym) return '';
  const [y, m] = ym.split('-');
  return `${MONTH_NAMES[parseInt(m) - 1]} ${y}`;
}

export function MonthPicker({ value, onChange, minMonth }: {
  value: string;
  onChange: (v: string) => void;
  minMonth?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();
  const parsed = value.split('-');
  const initYear = parseInt(parsed[0]);
  const [year, setYear] = useState(() => isNaN(initYear) ? now.getFullYear() : initYear);
  const selMonth = parseInt(parsed[1]) - 1;
  const selYear  = parseInt(parsed[0]);
  const minYear  = minMonth ? parseInt(minMonth.split('-')[0]) : undefined;

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function isDisabled(m: number) {
    if (year > now.getFullYear() || (year === now.getFullYear() && m > now.getMonth())) return true;
    if (minMonth) {
      const candidate = `${year}-${String(m + 1).padStart(2, '0')}`;
      if (candidate < minMonth) return true;
    }
    return false;
  }

  function select(m: number) {
    onChange(`${year}-${String(m + 1).padStart(2, '0')}`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
      >
        {MONTH_NAMES[selMonth]} {selYear}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-400">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52">
          <div className="flex items-center justify-between mb-2.5">
            <button
              onClick={() => setYear(y => y - 1)}
              disabled={minYear !== undefined && year <= minYear}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 11L5 7L9 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
            <span className="text-xs font-semibold text-gray-800">{year}</span>
            <button
              onClick={() => setYear(y => y + 1)}
              disabled={year >= now.getFullYear()}
              className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-30"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((name, m) => {
              const disabled   = isDisabled(m);
              const isSelected = m === selMonth && year === selYear;
              return (
                <button
                  key={m}
                  onClick={() => !disabled && select(m)}
                  disabled={disabled}
                  className={`px-2 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    isSelected ? 'bg-blue-600 text-white' :
                    disabled   ? 'text-gray-300 cursor-default' :
                                 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
