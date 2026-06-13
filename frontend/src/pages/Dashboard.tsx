import { useEffect, useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader, CardBody } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { getSummary, getFlags, getBankAccounts, getNetPosition } from '../api';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { AlertTriangle, CheckCircle, XCircle, ChevronRight, Landmark, Building2, X } from 'lucide-react';
import { fetchCashDeposits } from '../api/cashDeposits';

const FLAG_DESTINATIONS: Record<string, string> = {
  missing_invoice: '/cash-ledger',
  intergroup_mismatch: '/cash-ledger',
  file_completeness: '/import',
};

const SEVERITY_BORDER: Record<string, string> = {
  critical: 'border-l-4 border-red-400 bg-red-50/50',
  warning:  'border-l-4 border-amber-400 bg-amber-50/40',
  info:     'border-l-4 border-blue-300 bg-blue-50/30',
};

function fmt(n: number, decimals = 2) {
  return n.toLocaleString('en-AE', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const now = new Date();
  const [year, setYear] = useState(() => parseInt(value.split('-')[0]));
  const selMonth = parseInt(value.split('-')[1]) - 1;
  const selYear  = parseInt(value.split('-')[0]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  function select(m: number) {
    const padM = String(m + 1).padStart(2, '0');
    onChange(`${year}-${padM}`);
    setOpen(false);
  }

  function isFuture(m: number) {
    return year > now.getFullYear() || (year === now.getFullYear() && m > now.getMonth());
  }

  const label = `${MONTH_NAMES[selMonth]} ${selYear}`;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg text-gray-700 bg-white hover:bg-gray-50 transition-colors"
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className="text-gray-400">
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-52">
          {/* Year nav */}
          <div className="flex items-center justify-between mb-2.5">
            <button onClick={() => setYear(y => y - 1)} className="p-1 rounded hover:bg-gray-100 text-gray-500">
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
          {/* Month grid */}
          <div className="grid grid-cols-3 gap-1">
            {MONTH_NAMES.map((name, m) => {
              const isSelected = m === selMonth && year === selYear;
              const disabled   = isFuture(m);
              return (
                <button
                  key={m}
                  onClick={() => !disabled && select(m)}
                  disabled={disabled}
                  className={`px-2 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                    isSelected  ? 'bg-blue-600 text-white' :
                    disabled    ? 'text-gray-300 cursor-default' :
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

const netPositionCache: Record<number, { date: string; aed: number; usd: number }[]> = {};

function currentMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split('-').map(Number);
  const from = `${month}-01`;
  const now = new Date();
  if (y === now.getFullYear() && m === now.getMonth() + 1) {
    return { from, to: `${month}-${String(now.getDate()).padStart(2, '0')}` };
  }
  const lastDay = new Date(y, m, 0).getDate();
  return { from, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

function buildDailyTotals(month: string, toDate: string, rows: any[]): { labels: string[]; data: number[] } {
  const lastDay = parseInt(toDate.split('-')[2]);
  const byDay: Record<string, number> = {};
  rows.forEach((row: any) => {
    (row.deposits || []).forEach((d: any) => {
      byDay[d.date] = (byDay[d.date] || 0) + d.amount;
    });
  });
  const labels: string[] = [];
  const data: number[] = [];
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${month}-${String(day).padStart(2, '0')}`;
    labels.push(String(day));
    data.push(byDay[dateStr] || 0);
  }
  return { labels, data };
}

type ViewMode = 'accounts' | 'banks' | 'companies';

export default function Dashboard() {
  const navigate = useNavigate();
  const [flags, setFlags]       = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);
  const [viewMode, setViewMode]       = useState<ViewMode>('accounts');
  const [netPosition, setNetPosition] = useState<{ date: string; aed: number; usd: number }[]>([]);
  const [chartCcy, setChartCcy]         = useState<'AED' | 'USD' | 'both'>('AED');
  const [chartPeriod, setChartPeriod]   = useState<30 | 365>(30);
  const [chartLoading, setChartLoading] = useState(true);

  const [depositMonth, setDepositMonth]       = useState(currentMonthStr());
  const [depositChartData, setDepositChartData] = useState<{ labels: string[]; data: number[] } | null>(null);
  const [depositChartLoading, setDepositChartLoading] = useState(true);
  const [depositRawRows, setDepositRawRows]   = useState<any[]>([]);
  const [selectedDepositDay, setSelectedDepositDay] = useState<string | null>(null);
  const [activeDeposit, setActiveDeposit] = useState<{ day: number; amount: number; dateStr: string; x: number; y: number } | null>(null);
  const depositHideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const depositWrapperRef = useRef<HTMLDivElement>(null);
  const depositMousePos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    Promise.all([getSummary(), getFlags(undefined, false), getBankAccounts()])
      .then(([, f, a]) => { setFlags(f.data); setAccounts(a.data); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (netPositionCache[chartPeriod]) {
      setNetPosition(netPositionCache[chartPeriod]);
      setChartLoading(false);
      return;
    }
    setChartLoading(true);
    getNetPosition(chartPeriod).then(res => {
      netPositionCache[chartPeriod] = res.data;
      setNetPosition(res.data);
    }).finally(() => setChartLoading(false));
  }, [chartPeriod]);

  useEffect(() => {
    setDepositChartLoading(true);
    const { from, to } = getMonthRange(depositMonth);
    fetchCashDeposits(from, to)
      .then((data: any) => {
        const rows = (data.rows || []).filter((r: any) => r.bank_account !== null);
        setDepositRawRows(rows);
        setDepositChartData(buildDailyTotals(depositMonth, to, rows));
      })
      .finally(() => setDepositChartLoading(false));
  }, [depositMonth]);

  const totalAed = useMemo(
    () => accounts.filter(a => a.currency === 'AED' && Number(a.closing_balance) > 0).reduce((s, a) => s + Number(a.closing_balance), 0),
    [accounts],
  );
  const totalUsd = useMemo(
    () => accounts.filter(a => a.currency === 'USD' && Number(a.closing_balance) > 0).reduce((s, a) => s + Number(a.closing_balance), 0),
    [accounts],
  );

  const cutoff = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 90);
    return d;
  }, []);

  const isActive = (acc: any) => {
    if (!acc.last_transaction_date) return false;
    return new Date(acc.last_transaction_date) >= cutoff;
  };

  const groupStats = useMemo(() => {
    const pos = (active: boolean, ccy: string) =>
      accounts.filter(a => isActive(a) === active && a.currency === ccy && Number(a.closing_balance) > 0)
               .reduce((s, a) => s + Number(a.closing_balance), 0);
    return {
      aAed: pos(true,  'AED'), aUsd: pos(true,  'USD'), aCount: accounts.filter(a => isActive(a)).length,
      bAed: pos(false, 'AED'), bUsd: pos(false, 'USD'), bCount: accounts.filter(a => !isActive(a)).length,
    };
  }, [accounts, cutoff]);

  const byBank = useMemo(() => {
    const groups: Record<string, { bank_name: string; currency: string; group: string; total: number; count: number }> = {};
    accounts.forEach(acc => {
      const key = `${acc.bank_name}__${acc.currency}__${acc.group}`;
      if (!groups[key]) groups[key] = { bank_name: acc.bank_name, currency: acc.currency, group: acc.group, total: 0, count: 0 };
      groups[key].total += Number(acc.closing_balance);
      groups[key].count += 1;
    });
    return Object.values(groups).sort((a, b) => b.total - a.total);
  }, [accounts]);

  const byCompany = useMemo(() => {
    const groups: Record<string, { name: string; group: string; aed: number; usd: number; eur: number; accountCount: number }> = {};
    accounts.forEach(acc => {
      const name = acc.account_name;
      if (!groups[name]) groups[name] = { name, group: acc.group ?? '', aed: 0, usd: 0, eur: 0, accountCount: 0 };
      const bal = Number(acc.closing_balance);
      if (acc.currency === 'AED')      groups[name].aed += bal;
      else if (acc.currency === 'USD') groups[name].usd += bal;
      else if (acc.currency === 'EUR') groups[name].eur += bal;
      groups[name].accountCount += 1;
    });
    return Object.values(groups).sort((a, b) => b.aed - a.aed);
  }, [accounts]);

  const depositSummary = useMemo(() => {
    const byCompany: Record<number, { monthly_limit: number; total: number }> = {};
    depositRawRows.forEach((row: any) => {
      if (!byCompany[row.company_id]) byCompany[row.company_id] = { monthly_limit: row.monthly_limit || 0, total: 0 };
      byCompany[row.company_id].total += Number(row.total_deposits || 0);
    });
    const totalDeposited = Object.values(byCompany).reduce((s, c) => s + c.total, 0);
    const available      = Object.values(byCompany).reduce((s, c) => s + Math.max(0, c.monthly_limit - c.total), 0);
    return { totalDeposited, available };
  }, [depositRawRows]);

  const depositDayIndex = useMemo(() => {
    const idx: Record<string, Array<{ company_name: string; bank_account: string; category: string | null; amount: number; description: string }>> = {};
    depositRawRows.forEach((row: any) => {
      (row.deposits || []).forEach((d: any) => {
        if (!idx[d.date]) idx[d.date] = [];
        idx[d.date].push({ company_name: row.company_name, bank_account: row.bank_account, category: row.category, amount: Number(d.amount), description: d.description || '' });
      });
    });
    return idx;
  }, [depositRawRows]);

  const criticalCount = flags.filter(f => f.severity === 'critical').length;
  const warningCount  = flags.filter(f => f.severity === 'warning').length;

  const kpis = [
    { label: 'Total AED',      value: `AED ${fmt(totalAed)}`,       color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Total USD',      value: `USD ${fmt(totalUsd)}`,       color: 'text-blue-600',    bg: 'bg-blue-50'    },
    { label: 'Critical Flags', value: criticalCount.toString(),     color: 'text-red-600',     bg: 'bg-red-50'     },
    { label: 'Warnings',       value: warningCount.toString(),      color: 'text-amber-600',   bg: 'bg-amber-50'   },
  ];

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
      navigate(`/accounts/${flag.bank_account_id}`, {
        state: { highlightDate: flag.date, severity: flag.severity, description: flag.description },
      });
    } else {
      navigate('/flags');
    }
  };

  const chartData = netPosition.map(r => ({
    date: r.date.slice(5),
    AED: r.aed,
    USD: r.usd,
  }));

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <PageHeader title="Dashboard" subtitle="Live reconciliation overview" />
      <div className="p-8 space-y-6">

        {/* KPI cards */}
        <div className="grid grid-cols-4 gap-4">
          {kpis.map(({ label, value, color, bg }) => (
            <Card key={label}>
              <CardBody className={`flex items-center gap-4 rounded-xl ${bg}`}>
                <div>
                  <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>

        {/* Group A / Group B summary */}
        <div className="grid grid-cols-2 gap-4">
          {[
            { type: 'active',  group: 'A', label: 'Active Accounts | Bank Closing Balance',  aed: groupStats.aAed, usd: groupStats.aUsd, count: groupStats.aCount, bg: 'bg-indigo-50', badge: 'bg-indigo-100 text-indigo-700' },
            { type: 'passive', group: 'B', label: 'Passive Accounts | Bank Closing Balance', aed: groupStats.bAed, usd: groupStats.bUsd, count: groupStats.bCount, bg: 'bg-orange-50', badge: 'bg-orange-100 text-orange-700' },
          ].map(({ type, group, label, aed, usd, count, bg, badge }) => (
            <div key={group} onClick={() => navigate(`/account-group/${type}`)} className="cursor-pointer">
            <Card>
              <CardBody className={`rounded-xl ${bg}`}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${badge}`}>{group}</span>
                  <p className="text-sm font-semibold text-gray-800">{label}</p>
                  <span className="text-xs text-gray-400 ml-auto">{count} accounts</span>
                </div>
                <div className="flex gap-8">
                  <div>
                    <p className="text-[11px] text-gray-700 mb-0.5">AED Total</p>
                    <p className="text-lg font-bold font-mono text-emerald-600">{fmt(aed)}</p>
                  </div>
                  <div>
                    <p className="text-[11px] text-gray-700 mb-0.5">USD Total</p>
                    <p className="text-lg font-bold font-mono text-blue-600">{fmt(usd)}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
            </div>
          ))}
        </div>

        {/* Net position chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <p className="font-medium text-gray-900 text-sm">Net position — {chartPeriod === 30 ? 'last 30 days' : 'last year'}</p>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {([30, 365] as const).map(v => (
                    <button key={v} onClick={() => setChartPeriod(v)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${chartPeriod === v ? 'bg-gray-700 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                      {v === 30 ? '30D' : '1Y'}
                    </button>
                  ))}
                </div>
                <div className="w-px h-4 bg-gray-200" />
                <div className="flex gap-1">
                  {(['AED', 'USD', 'both'] as const).map(v => (
                    <button key={v} onClick={() => setChartCcy(v)}
                      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${chartCcy === v ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                      {v === 'both' ? 'Both' : v}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardBody>
            {chartLoading ? (
              <div className="flex items-center justify-center h-[200px]">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : chartData.length === 0 ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">No balance data imported yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(0)}K` : String(v)} width={60} />
                  <Tooltip formatter={(v, name) => [typeof v === 'number' ? `${name} ${v.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : v, name]} />
                  {chartCcy === 'both' && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />}
                  {(chartCcy === 'AED' || chartCcy === 'both') && (
                    <Line type="monotone" dataKey="AED" stroke="#059669" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  )}
                  {(chartCcy === 'USD' || chartCcy === 'both') && (
                    <Line type="monotone" dataKey="USD" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                  )}
                </LineChart>
              </ResponsiveContainer>
            )}
          </CardBody>
        </Card>

        {/* Daily cash deposits chart */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <p className="font-medium text-gray-900 text-sm">Daily Cash Deposits</p>
                {!depositChartLoading && depositRawRows.length > 0 && (
                  <div className="flex items-center gap-3 text-[11px]">
                    <span className="text-gray-400">Deposited: <span className="font-mono font-semibold text-emerald-600">AED {depositSummary.totalDeposited >= 1_000_000 ? `${(depositSummary.totalDeposited / 1_000_000).toFixed(2)}M` : `${Math.round(depositSummary.totalDeposited / 1000)}K`}</span></span>
                    <span className="text-gray-200">|</span>
                    <span className="text-gray-400">Available: <span className="font-mono font-semibold text-blue-600">AED {depositSummary.available >= 1_000_000 ? `${(depositSummary.available / 1_000_000).toFixed(2)}M` : `${Math.round(depositSummary.available / 1000)}K`}</span></span>
                  </div>
                )}
              </div>
              <MonthPicker value={depositMonth} onChange={setDepositMonth} />
            </div>
          </CardHeader>
          <CardBody>
            {depositChartLoading ? (
              <div className="flex items-center justify-center h-[200px]">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !depositChartData || depositChartData.data.every(v => v === 0) ? (
              <div className="flex items-center justify-center h-[200px] text-sm text-gray-400">
                No cash deposits recorded for this month
              </div>
            ) : (
              <div
                className="relative"
                ref={depositWrapperRef}
              >
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart
                    data={depositChartData.labels.map((label, i) => ({ day: label, AED: depositChartData!.data[i] }))}
                    margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                    onClick={(e: any) => {
                      if (e?.activePayload?.[0]?.payload?.AED > 0) {
                        const day = String(e.activePayload[0].payload.day).padStart(2, '0');
                        setSelectedDepositDay(`${depositMonth}-${day}`);
                        setActiveDeposit(null);
                      }
                    }}
                    style={{ cursor: 'pointer' }}
                    onMouseLeave={() => {
                      depositHideTimer.current = setTimeout(() => setActiveDeposit(null), 250);
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={v => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${Math.round(v / 1_000)}K` : String(v)} width={60} />
                    <Line
                      type="monotone" dataKey="AED" stroke="#059669" strokeWidth={2} dot={{ r: 3 }}
                      activeDot={(props: any) => {
                        const show = () => {
                          if (depositHideTimer.current) clearTimeout(depositHideTimer.current);
                          if ((props.payload?.AED ?? 0) > 0) {
                            setActiveDeposit({
                              day: props.payload.day,
                              amount: props.payload.AED,
                              dateStr: `${depositMonth}-${String(props.payload.day).padStart(2, '0')}`,
                              x: props.cx,
                              y: props.cy,
                            });
                          }
                        };
                        return (
                          <g style={{ cursor: 'pointer' }}
                            onMouseEnter={show}
                            onMouseLeave={() => { depositHideTimer.current = setTimeout(() => setActiveDeposit(null), 600); }}
                            onClick={() => { if ((props.payload?.AED ?? 0) > 0) { setSelectedDepositDay(`${depositMonth}-${String(props.payload.day).padStart(2, '0')}`); setActiveDeposit(null); } }}
                          >
                            <circle cx={props.cx} cy={props.cy} r={5} fill="#059669" />
                            <circle cx={props.cx} cy={props.cy} r={18} fill="transparent" />
                          </g>
                        );
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
                {activeDeposit && (
                  <div
                    className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[140px] pointer-events-auto"
                    style={{
                      left: activeDeposit.x > 220 ? activeDeposit.x - 158 : activeDeposit.x + 14,
                      top: Math.max(4, activeDeposit.y - 40),
                      animation: 'depositTooltipIn 120ms ease-out',
                    }}
                    onMouseEnter={() => {
                      if (depositHideTimer.current) clearTimeout(depositHideTimer.current);
                    }}
                    onMouseLeave={() => {
                      depositHideTimer.current = setTimeout(() => setActiveDeposit(null), 700);
                    }}
                  >
                    <p className="text-[11px] font-semibold text-gray-500 mb-1">Day {activeDeposit.day}</p>
                    <p className="text-sm font-mono font-bold text-emerald-600">
                      AED {activeDeposit.amount.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </p>
                    <button
                      onClick={() => { setSelectedDepositDay(activeDeposit.dateStr); setActiveDeposit(null); }}
                      className="mt-2 flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700"
                    >
                      See details <ChevronRight size={11} />
                    </button>
                  </div>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        <div className="grid grid-cols-2 gap-6">
          {/* Accounts panel with 3-tab view */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 text-sm">
                  {viewMode === 'accounts'  && `Accounts (${accounts.length})`}
                  {viewMode === 'banks'     && `By Bank (${byBank.length} groups)`}
                  {viewMode === 'companies' && `By Company (${byCompany.length})`}
                </p>
                <div className="flex gap-1 text-xs">
                  <TabBtn active={viewMode === 'accounts'}  onClick={() => setViewMode('accounts')}>All</TabBtn>
                  <TabBtn active={viewMode === 'banks'}     onClick={() => setViewMode('banks')}>
                    <Landmark size={11} className="inline mr-1" />By Bank
                  </TabBtn>
                  <TabBtn active={viewMode === 'companies'} onClick={() => setViewMode('companies')}>
                    <Building2 size={11} className="inline mr-1" />By Company
                  </TabBtn>
                </div>
              </div>
            </CardHeader>

            {/* All accounts list */}
            {viewMode === 'accounts' && (
              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {accounts.map((acc: any) => (
                  <button key={acc.id} onClick={() => navigate(`/accounts/${acc.id}`)}
                    className="flex items-center justify-between w-full px-6 py-3 hover:bg-gray-50 text-left transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-900 truncate">{acc.account_name}</p>
                        {acc.group && <GroupBadge group={acc.group} />}
                      </div>
                      <p className="text-xs text-gray-600">
                        {[acc.bank_name, acc.currency && `(${acc.currency})`].filter(Boolean).join(' ') || acc.account_code || '—'}
                      </p>
                    </div>
                    <div className="text-right ml-3 shrink-0">
                      <p className={`text-sm font-mono ${Number(acc.closing_balance) === 0 ? 'text-gray-300' : 'text-gray-700'}`}>
                        {fmt(Number(acc.closing_balance))}
                      </p>
                      <Badge label={acc.status || 'active'} variant={acc.status === 'active' ? 'success' : 'warning'} />
                    </div>
                  </button>
                ))}
                {accounts.length === 0 && <div className="px-6 py-8 text-center text-sm text-gray-400">No accounts imported yet</div>}
              </div>
            )}

            {/* By Bank */}
            {viewMode === 'banks' && (
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-2 text-xs font-medium text-gray-500">Bank</th>
                      <th className="text-left px-2 py-2 text-xs font-medium text-gray-500">CCY</th>
                      <th className="text-left px-2 py-2 text-xs font-medium text-gray-500">Grp</th>
                      <th className="text-right px-2 py-2 text-xs font-medium text-gray-500">Accts</th>
                      <th className="text-right px-6 py-2 text-xs font-medium text-gray-500">Total Balance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {byBank.map(row => (
                      <tr key={`${row.bank_name}__${row.currency}__${row.group}`} className="hover:bg-gray-50">
                        <td className="px-6 py-3 font-medium text-gray-800">{row.bank_name}</td>
                        <td className="px-2 py-3">
                          <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                            row.currency === 'AED' ? 'bg-emerald-100 text-emerald-700' :
                            row.currency === 'USD' ? 'bg-blue-100 text-blue-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>{row.currency}</span>
                        </td>
                        <td className="px-2 py-3"><GroupBadge group={row.group} /></td>
                        <td className="px-2 py-3 text-right text-gray-500">{row.count}</td>
                        <td className={`px-6 py-3 text-right font-mono font-semibold ${row.total === 0 ? 'text-gray-300' : 'text-gray-800'}`}>
                          {fmt(row.total)}
                        </td>
                      </tr>
                    ))}
                    {byBank.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">No accounts imported yet</td></tr>
                    )}
                  </tbody>
                  {byBank.length > 0 && (
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr>
                        <td colSpan={4} className="px-6 py-2 text-xs font-semibold text-gray-500">AED Total</td>
                        <td className="px-6 py-2 text-right font-mono font-bold text-emerald-700">{fmt(totalAed)}</td>
                      </tr>
                      <tr>
                        <td colSpan={4} className="px-6 py-2 text-xs font-semibold text-gray-500">USD Total</td>
                        <td className="px-6 py-2 text-right font-mono font-bold text-blue-700">{fmt(totalUsd)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {/* By Company */}
            {viewMode === 'companies' && (
              <div className="overflow-y-auto max-h-96">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="text-left px-6 py-2 text-xs font-medium text-gray-500">Company</th>
                      <th className="text-left px-2 py-2 text-xs font-medium text-gray-500">Grp</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">Accts</th>
                      <th className="text-right px-3 py-2 text-xs font-medium text-gray-500">AED</th>
                      <th className="text-right px-6 py-2 text-xs font-medium text-gray-500">USD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {byCompany.map(row => (
                      <tr key={row.name} className="hover:bg-gray-50">
                        <td className="px-6 py-2.5 font-medium text-gray-800 max-w-[140px] truncate" title={row.name}>{row.name}</td>
                        <td className="px-2 py-2.5"><GroupBadge group={row.group} /></td>
                        <td className="px-3 py-2.5 text-right text-gray-400 text-xs">{row.accountCount}</td>
                        <td className={`px-3 py-2.5 text-right font-mono text-xs ${row.aed === 0 ? 'text-gray-300' : 'text-emerald-700 font-semibold'}`}>
                          {row.aed === 0 ? '—' : fmt(row.aed)}
                        </td>
                        <td className={`px-6 py-2.5 text-right font-mono text-xs ${row.usd === 0 ? 'text-gray-300' : 'text-blue-700 font-semibold'}`}>
                          {row.usd === 0 ? '—' : fmt(row.usd)}
                        </td>
                      </tr>
                    ))}
                    {byCompany.length === 0 && (
                      <tr><td colSpan={5} className="px-6 py-8 text-center text-sm text-gray-400">No accounts imported yet</td></tr>
                    )}
                  </tbody>
                  {byCompany.length > 0 && (
                    <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-6 py-2 text-xs font-semibold text-gray-500">Totals</td>
                        <td className="px-3 py-2 text-right font-mono font-bold text-emerald-700 text-xs">{fmt(totalAed)}</td>
                        <td className="px-6 py-2 text-right font-mono font-bold text-blue-700 text-xs">{fmt(totalUsd)}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </Card>

          {/* Open flags */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <p className="font-medium text-gray-900 text-sm">Open flags ({flags.length})</p>
                {flags.length > 0 && (
                  <button onClick={() => navigate('/flags')} className="text-xs text-blue-600 hover:underline">View all</button>
                )}
              </div>
            </CardHeader>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {flags.map((flag: any) => (
                <button key={flag.id} onClick={() => goToFlag(flag)}
                  className={`flex items-start gap-3 w-full px-6 py-3 text-left transition-colors hover:brightness-95 group ${SEVERITY_BORDER[flag.severity] ?? ''}`}>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <Badge label={flag.severity} variant={flag.severity} />
                      <span className="text-xs text-gray-400">{flag.flag_type}</span>
                    </div>
                    <p className="text-xs text-gray-700 line-clamp-2">{flag.description}</p>
                    {flag.account_name && <p className="text-xs text-gray-400 mt-0.5">{flag.account_name}</p>}
                    <p className="text-xs text-gray-300 mt-0.5">{flag.date}</p>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 group-hover:text-gray-500 mt-1 shrink-0" />
                </button>
              ))}
              {flags.length === 0 && (
                <div className="px-6 py-8 text-center">
                  <CheckCircle size={20} className="text-green-500 mx-auto mb-2" />
                  <p className="text-sm text-gray-400">No open flags</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {selectedDepositDay && (
        <DepositDayModal
          date={selectedDepositDay}
          entries={depositDayIndex[selectedDepositDay] || []}
          onClose={() => setSelectedDepositDay(null)}
        />
      )}
    </Layout>
  );
}


function DepositDayModal({ date, entries, onClose }: {
  date: string;
  entries: Array<{ company_name: string; bank_account: string; category: string | null; amount: number; description: string }>;
  onClose: () => void;
}) {
  const total = entries.reduce((s, e) => s + e.amount, 0);
  const [y, m, d] = date.split('-');
  const label = `${parseInt(d)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][parseInt(m) - 1]} ${y}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onMouseDown={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div>
            <p className="font-semibold text-gray-900 text-sm">Cash Deposits — {label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{entries.length} deposit{entries.length !== 1 ? 's' : ''} · AED {total.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} total</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <X size={16} />
          </button>
        </div>
        {entries.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-gray-400">No deposit data available</div>
        ) : (
          <div className="overflow-y-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-5 py-2.5 font-medium text-gray-500">Company</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Bank Account</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Cat</th>
                  <th className="text-left px-3 py-2.5 font-medium text-gray-500">Description</th>
                  <th className="text-right px-5 py-2.5 font-medium text-gray-500">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {entries.map((e, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-5 py-2.5 font-medium text-gray-800 max-w-[130px] truncate" title={e.company_name}>{e.company_name}</td>
                    <td className="px-3 py-2.5 text-gray-500 max-w-[110px] truncate" title={e.bank_account}>{e.bank_account || '—'}</td>
                    <td className="px-3 py-2.5">
                      {e.category ? (
                        <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                          e.category === 'C' ? 'bg-purple-100 text-purple-700' :
                          e.category === 'B' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{e.category}</span>
                      ) : '—'}
                    </td>
                    <td className="px-3 py-2.5 text-gray-400 max-w-[100px] truncate" title={e.description}>{e.description || '—'}</td>
                    <td className="px-5 py-2.5 text-right font-mono font-semibold text-emerald-600">
                      {e.amount.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-gray-200 bg-gray-50">
                <tr>
                  <td colSpan={4} className="px-5 py-2.5 font-semibold text-gray-500">Total</td>
                  <td className="px-5 py-2.5 text-right font-mono font-bold text-emerald-700">
                    {total.toLocaleString('en-AE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function GroupBadge({ group }: { group: string }) {
  if (!group) return null;
  return (
    <span className={`inline-block text-[10px] font-bold px-1 py-0.5 rounded ${
      group === 'A' ? 'bg-indigo-100 text-indigo-700' : 'bg-orange-100 text-orange-700'
    }`}>
      {group}
    </span>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
        active ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );
}

