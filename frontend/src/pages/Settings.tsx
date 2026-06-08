import { useEffect, useState } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader, CardBody } from '../components/ui/card';
import {
  getEmailConfig,
  saveEmailConfig,
  toggleEmailMonitor,
  testEmailPoll,
  getEmailStatus,
  getRecentEmailImports,
  clearEmailImportLog,
} from '../api';
import { Eye, EyeOff, RefreshCw, CheckCircle, XCircle, Clock } from 'lucide-react';

const IMPORT_TYPES = [
  { value: 'group-a', label: 'Group A Balance Sheet' },
  { value: 'group-b', label: 'Group B Balance Sheet' },
  { value: 'transactions', label: 'Bank Transactions' },
  { value: 'cashflow', label: 'Daily Cashflow' },
];

export default function Settings() {
  const [config, setConfig] = useState({
    email: '',
    app_password: '',
    poll_interval_minutes: 5,
    is_active: false,
    import_type: 'transactions' as 'group-a' | 'group-b' | 'transactions' | 'cashflow',
    sender_filter: '',
  });
  const [status, setStatus] = useState<{
    isActive: boolean;
    lastChecked: string | null;
    nextCheck: string | null;
    recentCount: number;
  } | null>(null);
  const [recentImports, setRecentImports] = useState<any[]>([]);
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [testMsg, setTestMsg] = useState('');

  const load = async () => {
    try {
      const [cfgRes, statusRes, recentRes] = await Promise.all([
        getEmailConfig(),
        getEmailStatus(),
        getRecentEmailImports(),
      ]);
      if (cfgRes.data) {
        setConfig({
          email: cfgRes.data.email ?? '',
          app_password: cfgRes.data.app_password ?? '',
          poll_interval_minutes: cfgRes.data.poll_interval_minutes ?? 5,
          is_active: cfgRes.data.is_active ?? false,
          import_type: cfgRes.data.import_type ?? 'transactions',
          sender_filter: cfgRes.data.sender_filter ?? '',
        });
      }
      setStatus(statusRes.data);
      setRecentImports(recentRes.data);
    } catch {
      // no config yet — defaults stay
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg('');
    try {
      await saveEmailConfig(config);
      setSaveMsg('Saved successfully');
      await load();
    } catch (e: any) {
      setSaveMsg(e?.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 3000);
    }
  };

  const handleToggle = async () => {
    try {
      const res = await toggleEmailMonitor();
      setConfig((prev) => ({ ...prev, is_active: res.data.is_active }));
      await load();
    } catch (e: any) {
      alert(e?.response?.data?.message || 'Toggle failed');
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setTestMsg('Checking inbox…');
    try {
      await testEmailPoll();
      // Poll runs in background on server — wait then refresh status
      setTimeout(async () => {
        await load();
        setTestMsg('Check complete — see recent imports below');
        setTesting(false);
      }, 12000);
    } catch (e: any) {
      setTestMsg(e?.response?.data?.message || 'Test failed');
      setTesting(false);
    }
  };

  const fmt = (iso: string | null) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-AE', { dateStyle: 'medium', timeStyle: 'short' });
  };

  return (
    <Layout>
      <PageHeader
        title="Email Import"
        subtitle="Automatically import bank statements from Gmail attachments"
      />

      <div className="px-8 py-6 space-y-6 max-w-3xl">

        {/* Status card */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-700">Monitor Status</h2>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <p className="text-xs text-gray-500 mb-1">Status</p>
                <div className="flex items-center gap-1.5">
                  {status?.isActive
                    ? <CheckCircle size={14} className="text-green-500" />
                    : <XCircle size={14} className="text-gray-400" />}
                  <span className={`text-sm font-medium ${status?.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                    {status?.isActive ? 'Active' : 'Inactive'}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Last Checked</p>
                <p className="text-sm text-gray-700">{fmt(status?.lastChecked ?? null)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-1">Files Imported (7 days)</p>
                <p className="text-sm font-semibold text-gray-900">{status?.recentCount ?? 0}</p>
              </div>
            </div>
            {status?.nextCheck && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                <Clock size={12} />
                Next check: {fmt(status.nextCheck)}
              </div>
            )}
          </CardBody>
        </Card>

        {/* Config form */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-700">Gmail Configuration</h2>
          </CardHeader>
          <CardBody className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Gmail Address</label>
                <input
                  type="email"
                  value={config.email}
                  onChange={(e) => setConfig((p) => ({ ...p, email: e.target.value }))}
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">App Password</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={config.app_password}
                    onChange={(e) => setConfig((p) => ({ ...p, app_password: e.target.value }))}
                    placeholder="xxxx xxxx xxxx xxxx"
                    className="w-full px-3 py-2 pr-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  Generate at myaccount.google.com → Security → App Passwords (requires 2FA)
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Import Type</label>
                <select
                  value={config.import_type}
                  onChange={(e) => setConfig((p) => ({ ...p, import_type: e.target.value as any }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                >
                  {IMPORT_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Check Every (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  value={config.poll_interval_minutes}
                  onChange={(e) => setConfig((p) => ({ ...p, poll_interval_minutes: parseInt(e.target.value) || 5 }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Sender Filter <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={config.sender_filter}
                onChange={(e) => setConfig((p) => ({ ...p, sender_filter: e.target.value }))}
                placeholder="e.g. notifications@bank.ae"
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">Only import attachments from this sender address</p>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <span className="text-xs font-medium text-gray-600">Auto-import active</span>
                <button
                  onClick={handleToggle}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                    config.is_active ? 'bg-blue-600' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      config.is_active ? 'translate-x-4' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center gap-3">
                {saveMsg && (
                  <span className={`text-xs ${saveMsg.includes('success') ? 'text-green-600' : 'text-red-500'}`}>
                    {saveMsg}
                  </span>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          </CardBody>
        </Card>

        {/* Manual test */}
        <Card>
          <CardHeader>
            <h2 className="text-sm font-semibold text-gray-700">Manual Check</h2>
          </CardHeader>
          <CardBody>
            <div className="flex items-center gap-4">
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex items-center gap-2 px-4 py-2 bg-gray-800 text-white text-sm rounded-lg hover:bg-gray-700 disabled:opacity-50 transition-colors"
              >
                <RefreshCw size={14} className={testing ? 'animate-spin' : ''} />
                {testing ? 'Checking…' : 'Check Now'}
              </button>
              {testMsg && (
                <span className="text-sm text-gray-600">{testMsg}</span>
              )}
            </div>
          </CardBody>
        </Card>

        {/* Recent imports */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-700">Recent Imports</h2>
              {recentImports.length > 0 && (
                <button
                  onClick={async () => {
                    if (!confirm('Delete all email-imported bank statement data and clear the import log? Manually uploaded statements are not affected.')) return;
                    await clearEmailImportLog();
                    await load();
                  }}
                  className="text-xs text-red-500 hover:text-red-700 transition-colors"
                >
                  Clear log
                </button>
              )}
            </div>
          </CardHeader>
          {recentImports.length === 0 ? (
            <CardBody>
              <p className="text-sm text-gray-400">No imports yet.</p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Filename</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Imported</th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Records</th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wide">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {recentImports.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-mono text-xs text-gray-700 max-w-xs truncate">{item.filename}</td>
                      <td className="px-6 py-3 text-gray-600 capitalize">{item.import_type}</td>
                      <td className="px-6 py-3 text-gray-500">{fmt(item.imported_at)}</td>
                      <td className="px-6 py-3 text-right text-gray-700 tabular-nums">{item.records_imported}</td>
                      <td className="px-6 py-3">
                        {item.error ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-600">
                            <XCircle size={12} /> {item.error.slice(0, 60)}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle size={12} /> Success
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

      </div>
    </Layout>
  );
}
