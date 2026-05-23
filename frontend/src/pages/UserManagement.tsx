import { useEffect, useState } from 'react';
import { Layout, PageHeader } from '../components/Layout';
import { Card, CardHeader, CardBody } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { getUsers, createUser, updateUserRole, deleteUser } from '../api';
import { UserPlus, Trash2 } from 'lucide-react';

const ROLES = ['admin', 'accountant', 'viewer'] as const;
type Role = typeof ROLES[number];

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'viewer' as Role });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const load = () => getUsers().then((r) => setUsers(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setError('');
    setCreating(true);
    try {
      await createUser(form);
      setForm({ name: '', email: '', password: '', role: 'viewer' });
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (id: number, role: string) => {
    await updateUserRole(id, role);
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role } : u)));
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this user?')) return;
    await deleteUser(id);
    setUsers((prev) => prev.filter((u) => u.id !== id));
  };

  const roleVariant: Record<string, string> = { admin: 'critical', accountant: 'warning', viewer: 'default' };

  return (
    <Layout>
      <PageHeader
        title="User Management"
        subtitle="Admin only — manage system users and roles"
        action={
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <UserPlus size={14} />
            Add user
          </Button>
        }
      />

      <div className="p-8 space-y-6">
        {showForm && (
          <Card>
            <CardHeader><p className="font-medium text-sm text-gray-900">New user</p></CardHeader>
            <CardBody className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-700">{error}</div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Name</label>
                  <input
                    value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Full name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input
                    type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="user@company.ae"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
                  <input
                    type="password" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Min 6 characters"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                  <select
                    value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" loading={creating} onClick={handleCreate}>Create</Button>
                <Button size="sm" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </CardBody>
          </Card>
        )}

        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-6 py-3 text-xs font-medium text-gray-500">Name</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500">Email</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500">Role</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500">Created</th>
                  <th className="px-6 py-3 text-xs font-medium text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u: any) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-800">{u.name}</td>
                    <td className="px-6 py-3 text-gray-500">{u.email}</td>
                    <td className="px-6 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="border border-gray-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </td>
                    <td className="px-6 py-3 text-gray-400 text-xs">
                      {new Date(u.created_at ?? u.createdAt).toLocaleDateString('en-AE')}
                    </td>
                    <td className="px-6 py-3">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!loading && users.length === 0 && (
                  <tr><td colSpan={5} className="px-6 py-8 text-center text-gray-400">No users found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </Layout>
  );
}
