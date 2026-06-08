import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, PageHeader } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import {
  getCompanyProfiles, createCompanyProfile, updateCompanyProfile, deleteCompanyProfile,
  API_BASE,
} from '../api';
import { Building2, Plus, Search, Pencil, Trash2, X } from 'lucide-react';

interface CompanyProfile {
  id: number;
  category: string | null;
  company_name: string;
  owner_name: string;
  address: string;
  turnover_aed: number | null;
  logo_path: string | null;
  company_active_accounts: string;
  personal_active_accounts: string;
}

const CATEGORY_STYLES: Record<string, string> = {
  A: 'bg-amber-100 text-amber-800 border border-amber-300',
  B: 'bg-sky-100 text-sky-800 border border-sky-300',
  C: 'bg-slate-100 text-slate-700 border border-slate-300',
};

function categoryBadge(cat: string | null) {
  if (!cat) return <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">—</span>;
  return (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${CATEGORY_STYLES[cat] ?? 'bg-gray-100 text-gray-500'}`}>
      {cat}
    </span>
  );
}

function AccountPills({ raw }: { raw: string }) {
  const accounts = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (!accounts.length) return <span className="text-gray-400 text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {accounts.map(a => (
        <span key={a} className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded">
          {a}
        </span>
      ))}
    </div>
  );
}

const EMPTY_FORM = {
  category: '', company_name: '', owner_name: '', address: '',
  turnover_aed: '', company_active_accounts: '', personal_active_accounts: '',
};

export default function CompanyProfiles() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const canEdit = isAdmin;

  const [profiles, setProfiles] = useState<CompanyProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<CompanyProfile | null>(null);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyProfile | null>(null);

  const load = () => {
    setLoading(true);
    getCompanyProfiles().then(r => setProfiles(r.data)).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setShowModal(true);
  };

  const openEdit = (e: React.MouseEvent, p: CompanyProfile) => {
    e.stopPropagation();
    setEditing(p);
    setForm({
      category: p.category ?? '',
      company_name: p.company_name,
      owner_name: p.owner_name ?? '',
      address: p.address ?? '',
      turnover_aed: p.turnover_aed != null ? String(p.turnover_aed) : '',
      company_active_accounts: p.company_active_accounts ?? '',
      personal_active_accounts: p.personal_active_accounts ?? '',
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.company_name.trim()) return;
    setSaving(true);
    try {
      const dto = {
        category: form.category || undefined,
        company_name: form.company_name.trim(),
        owner_name: form.owner_name.trim() || undefined,
        address: form.address.trim() || undefined,
        turnover_aed: form.turnover_aed ? Number(form.turnover_aed) : undefined,
        company_active_accounts: form.company_active_accounts.trim() || undefined,
        personal_active_accounts: form.personal_active_accounts.trim() || undefined,
      };
      if (editing) {
        await updateCompanyProfile(editing.id, dto);
      } else {
        await createCompanyProfile(dto);
      }
      setShowModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    await deleteCompanyProfile(deleteTarget.id);
    setDeleteTarget(null);
    load();
  };

  const visible = profiles.filter(p => {
    const q = search.toLowerCase();
    const matchSearch = !q || p.company_name.toLowerCase().includes(q) || (p.owner_name ?? '').toLowerCase().includes(q);
    const matchCat = !catFilter || p.category === catFilter;
    return matchSearch && matchCat;
  });

  return (
    <Layout>
      <PageHeader
        title="Company Profiles"
        subtitle={`${profiles.length} companies`}
        action={
          canEdit ? (
            <button onClick={openAdd} className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded-lg">
              <Plus size={15} /> Add Company
            </button>
          ) : undefined
        }
      />

      {/* Filters */}
      <div className="px-8 py-4 bg-white border-b border-gray-100 flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or owner…"
            className="w-full pl-8 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex gap-1">
          {['', 'A', 'B', 'C'].map(cat => (
            <button
              key={cat}
              onClick={() => setCatFilter(cat)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${catFilter === cat
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}
            >
              {cat || 'All'}
            </button>
          ))}
        </div>
        <span className="text-sm text-gray-400 ml-auto">{visible.length} shown</span>
      </div>

      <div className="px-8 py-6">
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="text-center py-16 text-gray-400">No companies found</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {visible.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/company-profiles/${p.id}`)}
                className="bg-white rounded-xl border border-gray-200 p-5 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all group"
              >
                {/* Header: logo + category + actions */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    {p.logo_path ? (
                      <img
                        src={`${API_BASE}/uploads/${p.logo_path}`}
                        alt="logo"
                        className="w-10 h-10 rounded-lg object-cover border border-gray-100"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-sm">
                        {p.company_name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    {categoryBadge(p.category)}
                  </div>
                  {canEdit && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={e => openEdit(e, p)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setDeleteTarget(p); }}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Name + Owner */}
                <h3 className="font-semibold text-gray-900 text-sm leading-tight mb-1 line-clamp-2">
                  {p.company_name}
                </h3>
                {p.owner_name && (
                  <p className="text-xs text-gray-500 mb-3 truncate">{p.owner_name}</p>
                )}

                {/* Company accounts */}
                {p.company_active_accounts && (
                  <div className="mt-2">
                    <p className="text-xs text-gray-400 mb-1">Company Accounts</p>
                    <AccountPills raw={p.company_active_accounts} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{editing ? 'Edit Company' : 'Add Company'}</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Company Name *</label>
                  <input
                    value={form.company_name}
                    onChange={e => setForm(f => ({ ...f, company_name: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Company name"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Category</label>
                  <select
                    value={form.category}
                    onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">— None —</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="C">C</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner Name</label>
                <input
                  value={form.owner_name}
                  onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Owner / manager name"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <textarea
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  rows={2}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                  placeholder="Office address"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Annual Turnover (AED)</label>
                <input
                  type="number"
                  value={form.turnover_aed}
                  onChange={e => setForm(f => ({ ...f, turnover_aed: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company Active Accounts</label>
                <input
                  value={form.company_active_accounts}
                  onChange={e => setForm(f => ({ ...f, company_active_accounts: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="NBF, SIB, ADIB, WIO (comma separated)"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Personal Active Accounts (Owner)</label>
                <input
                  value={form.personal_active_accounts}
                  onChange={e => setForm(f => ({ ...f, personal_active_accounts: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="MASHREQ NEO, ENBD (comma separated)"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!form.company_name.trim() || saving}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : editing ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Delete Company?</h3>
            <p className="text-sm text-gray-500 mb-5">
              <span className="font-medium text-gray-700">{deleteTarget.company_name}</span> and all its buyer/supplier links will be permanently removed.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteTarget(null)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">
                Cancel
              </button>
              <button onClick={handleDelete} className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
