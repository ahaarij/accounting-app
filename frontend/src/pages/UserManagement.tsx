import { useEffect, useState } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import { Trash2, CheckCircle, XCircle } from 'lucide-react';
import api from '../api/client';
import { cn } from '../lib/utils';

const ROLES = ['super_admin', 'admin', 'developer', 'user'] as const;
type Role = typeof ROLES[number];

const ROLE_COLORS: Record<Role, string> = {
  super_admin: 'bg-purple-100 text-purple-700',
  admin:       'bg-blue-100 text-blue-700',
  developer:   'bg-amber-100 text-amber-700',
  user:        'bg-gray-100 text-gray-600',
};

const STATUS_COLORS: Record<string, string> = {
  active:   'bg-green-100 text-green-700',
  pending:  'bg-amber-100 text-amber-700',
  rejected: 'bg-red-100 text-red-600',
};

export default function UserManagement() {
  const { user: me, isSuperAdmin } = useAuth();
  const [tab, setTab] = useState<'pending' | 'users'>('users');
  const [users, setUsers] = useState<any[]>([]);
  const [pending, setPending] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadAll() {
    setLoading(true);
    const [u, p] = await Promise.all([api.get('/users'), api.get('/users/pending')]);
    setUsers(u.data);
    setPending(p.data);
    setLoading(false);
  }
  useEffect(() => { loadAll(); }, []);

  async function approve(id: number) {
    await api.patch(`/users/${id}/approve`);
    await loadAll();
  }
  async function reject(id: number) {
    await api.patch(`/users/${id}/reject`);
    await loadAll();
  }
  async function handleRoleChange(id: number, role: string) {
    await api.patch(`/users/${id}/role`, { role });
    setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role } : u));
  }
  async function handleDelete(id: number) {
    if (!confirm('Delete this user?')) return;
    await api.delete(`/users/${id}`);
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }

  const inputCls = 'border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <Layout>
      <PageHeader title="User Management" subtitle="Manage access and roles" />
      <div className="p-8 space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
          {(['users', 'pending'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={cn('px-4 py-1.5 text-xs font-medium rounded-md transition-colors relative',
                tab === t ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700')}>
              {t === 'pending' ? 'Pending Requests' : 'Active Users'}
              {t === 'pending' && pending.length > 0 && (
                <span className="ml-1.5 bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 leading-none">
                  {pending.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading…</div>
        ) : tab === 'pending' ? (

          /* ── Pending tab ── */
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Email', 'Requested', 'Actions'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {pending.length === 0 ? (
                  <tr><td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-400">No pending requests</td></tr>
                ) : pending.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{u.name}</td>
                    <td className="px-6 py-3 text-gray-500">{u.email}</td>
                    <td className="px-6 py-3 text-gray-400 text-xs">
                      {new Date(u.createdAt ?? u.created_at).toLocaleDateString('en-AE')}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        <button onClick={() => approve(u.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
                          <CheckCircle size={12} /> Approve
                        </button>
                        <button onClick={() => reject(u.id)}
                          className="flex items-center gap-1 px-2.5 py-1 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50 transition-colors">
                          <XCircle size={12} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

        ) : (

          /* ── Users tab ── */
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {['Name', 'Email', 'Role', 'Status', 'Joined', 'Actions'].map((h) => (
                    <th key={h} className="px-6 py-3 text-left text-xs font-medium text-gray-500">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-10 text-center text-sm text-gray-400">No users found</td></tr>
                ) : users.map((u: any) => {
                  const isSelf = u.id === me?.id;
                  const isProtected = u.role === 'super_admin' || isSelf;
                  return (
                    <tr key={u.id} className="hover:bg-gray-50">
                      <td className="px-6 py-3 font-medium text-gray-800">{u.name}</td>
                      <td className="px-6 py-3 text-gray-500">{u.email}</td>
                      <td className="px-6 py-3">
                        {isSuperAdmin && !isProtected ? (
                          <select value={u.role} onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className={inputCls}>
                            {ROLES.filter((r) => r !== 'super_admin').map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        ) : (
                          <span className={cn('px-2 py-0.5 text-xs font-medium rounded', ROLE_COLORS[u.role as Role] ?? 'bg-gray-100 text-gray-600')}>
                            {u.role}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-3">
                        <span className={cn('px-2 py-0.5 text-xs font-medium rounded', STATUS_COLORS[u.status] ?? '')}>
                          {u.status}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-gray-400 text-xs">
                        {new Date(u.createdAt ?? u.created_at).toLocaleDateString('en-AE')}
                      </td>
                      <td className="px-6 py-3">
                        {!isProtected && isSuperAdmin && (
                          <button onClick={() => handleDelete(u.id)} className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
