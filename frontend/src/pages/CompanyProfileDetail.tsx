import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { useAuth } from '../auth/AuthContext';
import {
  getCompanyProfile, getCompanyProfiles, updateCompanyProfile, uploadCompanyLogo,
  createBuyerSupplier, addCompanyLink,
  updateBuyerSupplier, deleteBuyerSupplier, API_BASE,
} from '../api';
import {
  ArrowLeft, Pencil, X, Plus, Trash2, Link2,
  MapPin, TrendingUp, Landmark, User, Globe, Phone, Mail,
} from 'lucide-react';

const COUNTRIES = ['UAE', 'India', 'Hong Kong', 'US', 'Canada'];
const FALLBACK_BANKS = [
  'NBF', 'SIB', 'ADIB', 'WIO', 'MASHREQ', 'MASHREQ NEO',
  'ENBD', 'FAB', 'EIB', 'ADCB', 'RAK', 'UBL',
  'SCB', 'LIV', 'HBZ', 'INDUS IND', 'BANQUE MISR',
];
const FALLBACK_CATS = ['General Trading', 'Logistics', 'IT', 'Real Estate', 'Manufacturing', 'Retail', 'Services', 'Offshore'];

function lsGet<T>(key: string, fb: T): T {
  try { const v = localStorage.getItem(key); if (v) return JSON.parse(v); } catch {}
  return fb;
}

interface Party {
  link_id: number;
  id: number;
  name: string;
  type: string;
  address: string | null;
  contact_info: string | null;
  linked_company_id: number | null;
  linked_company: { id: number; company_name: string } | null;
}

interface ProfileDetail {
  id: number;
  category: string | null;
  company_name: string;
  owner_name: string | null;
  address: string | null;
  turnover_aed: number | null;
  logo_path: string | null;
  company_active_accounts: string | null;
  company_inactive_accounts: string | null;
  personal_active_accounts: string | null;
  personal_inactive_accounts: string | null;
  country: string | null;
  is_active: boolean;
  contact_emails: string | null;
  contact_phone: string | null;
  industry: string | null;
  suppliers: Party[];
  buyers: Party[];
}

const TIER_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  A: { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', label: 'Tier A' },
  B: { bg: 'bg-sky-50 border-sky-200', text: 'text-sky-800', label: 'Tier B' },
  C: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700', label: 'Tier C' },
};

function AccountPillsWithStatus({ active, inactive }: { active: string | null; inactive: string | null }) {
  const activeList   = active   ? active.split(',').map(s => s.trim()).filter(Boolean)   : [];
  const inactiveList = inactive ? inactive.split(',').map(s => s.trim()).filter(Boolean) : [];
  if (!activeList.length && !inactiveList.length)
    return <span className="text-gray-400 text-xs italic">None recorded</span>;
  return (
    <div className="space-y-2">
      {activeList.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {activeList.map(a => (
            <span key={a} className="inline-flex items-center gap-1.5 text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />{a}
            </span>
          ))}
        </div>
      )}
      {inactiveList.length > 0 && (
        <>
          {activeList.length > 0 && <div className="border-t border-gray-100" />}
          <div className="flex flex-wrap gap-1.5">
            {inactiveList.map(a => (
              <span key={a} className="inline-flex items-center gap-1.5 text-xs bg-red-50 text-red-500 border border-red-200 px-2.5 py-1 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" />{a}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function BankStatusSelector({ label, banks, activeAccounts, inactiveAccounts, onChangeActive, onChangeInactive }: {
  label: string; banks: string[];
  activeAccounts: string[]; inactiveAccounts: string[];
  onChangeActive: (a: string[]) => void; onChangeInactive: (a: string[]) => void;
}) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSearch('');
      }
    }
    if (dropdownOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownOpen]);

  const selectedBanks = [...activeAccounts, ...inactiveAccounts];
  const availableBanks = banks.filter(b => !selectedBanks.includes(b));
  const filtered = search
    ? availableBanks.filter(b => b.toLowerCase().includes(search.toLowerCase()))
    : availableBanks;

  function addBank(b: string) {
    onChangeActive([...activeAccounts, b]);
    setSearch('');
    setDropdownOpen(false);
  }

  function removeBank(b: string) {
    onChangeActive(activeAccounts.filter(x => x !== b));
    onChangeInactive(inactiveAccounts.filter(x => x !== b));
  }

  function toggleStatus(b: string) {
    if (activeAccounts.includes(b)) {
      onChangeActive(activeAccounts.filter(x => x !== b));
      onChangeInactive([...inactiveAccounts, b]);
    } else {
      onChangeInactive(inactiveAccounts.filter(x => x !== b));
      onChangeActive([...activeAccounts, b]);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs font-medium text-gray-600">{label}</label>
        <div className="flex items-center gap-2 text-[11px]">
          {activeAccounts.length > 0 && (
            <span className="flex items-center gap-1 text-green-600 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />{activeAccounts.length} active
            </span>
          )}
          {inactiveAccounts.length > 0 && (
            <span className="flex items-center gap-1 text-red-400 font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400" />{inactiveAccounts.length} inactive
            </span>
          )}
          {banks.length > 0 && (
            <div className="relative" ref={containerRef}>
              <button type="button" onClick={() => setDropdownOpen(o => !o)}
                className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg border border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors focus:outline-none">
                <Plus size={10} /> Add
              </button>
              {dropdownOpen && (
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
                  <div className="p-2 border-b border-gray-100">
                    <input autoFocus value={search} onChange={e => setSearch(e.target.value)}
                      placeholder="Search banks…"
                      className="w-full text-xs px-2.5 py-1.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400" />
                  </div>
                  <div className="max-h-44 overflow-y-auto py-1">
                    {filtered.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-2">
                        {availableBanks.length === 0 ? 'All banks added' : 'No banks found'}
                      </p>
                    ) : (
                      filtered.map(b => (
                        <button key={b} type="button" onClick={() => addBank(b)}
                          className="w-full text-left text-xs px-3 py-1.5 hover:bg-blue-50 hover:text-blue-700 text-gray-700 transition-colors">
                          {b}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 min-h-[2.75rem] items-center p-2 bg-gray-50 rounded-xl border border-gray-200">
        {selectedBanks.length === 0 ? (
          <span className="text-xs text-gray-400 ml-1 select-none">No accounts added</span>
        ) : (
          selectedBanks.map(b => {
            const isActive = activeAccounts.includes(b);
            return (
              <span key={b} className={`inline-flex items-center rounded-lg border font-medium text-xs overflow-hidden ${
                isActive ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
              }`}>
                <button type="button" onClick={() => toggleStatus(b)}
                  title={isActive ? 'Click to mark inactive' : 'Click to mark active'}
                  className={`inline-flex items-center gap-1.5 px-2 py-1 transition-colors ${
                    isActive ? 'text-green-700 hover:bg-green-100' : 'text-red-500 hover:bg-red-100'
                  }`}>
                  <span className={`block w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-green-500' : 'bg-red-400'}`} />
                  {b}
                </button>
                <button type="button" onClick={() => removeBank(b)}
                  className={`px-1.5 py-1 transition-colors border-l ${
                    isActive
                      ? 'border-green-200 text-green-400 hover:text-red-500 hover:bg-red-50'
                      : 'border-red-200 text-red-300 hover:text-red-500 hover:bg-red-100'
                  }`}>
                  <X size={10} />
                </button>
              </span>
            );
          })
        )}
      </div>
    </div>
  );
}

const EMPTY_PARTY = { name: '', type: 'buyer', address: '', contact_info: '', linked_company_id: '' };

export default function CompanyProfileDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const canEdit = isAdmin;
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [allProfiles, setAllProfiles] = useState<{ id: number; company_name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [emailList, setEmailList] = useState<string[]>(['']);
  const [companyAccounts, setCompanyAccounts] = useState<string[]>([]);
  const [companyInactiveAccounts, setCompanyInactiveAccounts] = useState<string[]>([]);
  const [personalAccounts, setPersonalAccounts] = useState<string[]>([]);
  const [personalInactiveAccounts, setPersonalInactiveAccounts] = useState<string[]>([]);
  const [industryEdit, setIndustryEdit] = useState('');
  const [bankNames, setBankNames] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);

  const [partyModal, setPartyModal] = useState<'buyer' | 'supplier' | null>(null);
  const [partyForm, setPartyForm] = useState({ ...EMPTY_PARTY });
  const [partySaving, setPartySaving] = useState(false);

  const [editParty, setEditParty] = useState<Party | null>(null);
  const [editPartyForm, setEditPartyForm] = useState({ ...EMPTY_PARTY });
  const [editPartySaving, setEditPartySaving] = useState(false);

  const [deleteParty, setDeleteParty] = useState<{ party: Party; relationship: string } | null>(null);

  const load = () => {
    if (!id) return;
    setLoading(true);
    Promise.all([getCompanyProfile(Number(id)), getCompanyProfiles()])
      .then(([pRes, allRes]) => {
        setProfile(pRes.data);
        setAllProfiles(allRes.data);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setBankNames(lsGet('settings_bank_names', FALLBACK_BANKS));
    setCategories(lsGet('settings_company_categories', FALLBACK_CATS));
    load();
  }, [id]);

  const openEdit = () => {
    if (!profile) return;
    setEditForm({
      category: profile.category ?? '',
      company_name: profile.company_name,
      owner_name: profile.owner_name ?? '',
      address: profile.address ?? '',
      turnover_aed: profile.turnover_aed != null ? String(profile.turnover_aed) : '',
      country: profile.country ?? '',
      is_active: profile.is_active ?? true,
      contact_phone: profile.contact_phone ?? '',
    });
    const cActive = profile.company_active_accounts ? profile.company_active_accounts.split(',').map(s => s.trim()).filter(Boolean) : [];
    const cInactive = profile.company_inactive_accounts ? profile.company_inactive_accounts.split(',').map(s => s.trim()).filter(Boolean) : [];
    const pActive = profile.personal_active_accounts ? profile.personal_active_accounts.split(',').map(s => s.trim()).filter(Boolean) : [];
    const pInactive = profile.personal_inactive_accounts ? profile.personal_inactive_accounts.split(',').map(s => s.trim()).filter(Boolean) : [];
    setCompanyAccounts(cActive);
    setCompanyInactiveAccounts(cInactive.filter(b => !cActive.includes(b)));
    setPersonalAccounts(pActive);
    setPersonalInactiveAccounts(pInactive.filter(b => !pActive.includes(b)));
    const emails = profile.contact_emails ? profile.contact_emails.split(',').map(e => e.trim()).filter(Boolean) : [];
    setEmailList(emails.length > 0 ? emails : ['']);
    setIndustryEdit(profile.industry || '');
    setEditMode(true);
  };

  const handleSaveEdit = async () => {
    if (!profile) return;
    setSaving(true);
    try {
      await updateCompanyProfile(profile.id, {
        category: editForm.category || undefined,
        company_name: editForm.company_name,
        owner_name: editForm.owner_name || undefined,
        address: editForm.address || undefined,
        turnover_aed: editForm.turnover_aed ? Number(editForm.turnover_aed) : undefined,
        company_active_accounts: companyAccounts.join(', '),
        company_inactive_accounts: companyInactiveAccounts.join(', '),
        personal_active_accounts: personalAccounts.join(', '),
        personal_inactive_accounts: personalInactiveAccounts.join(', '),
        country: editForm.country || undefined,
        is_active: editForm.is_active,
        contact_emails: emailList.filter(e => e.trim()).join(',') || undefined,
        contact_phone: editForm.contact_phone || undefined,
        industry: industryEdit || undefined,
      });
      setEditMode(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleLogoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !profile) return;
    await uploadCompanyLogo(profile.id, file);
    load();
  };

  const openAddParty = (relationship: 'buyer' | 'supplier') => {
    setPartyForm({ ...EMPTY_PARTY, type: relationship === 'buyer' ? 'buyer' : 'supplier' });
    setPartyModal(relationship);
  };

  const handleAddParty = async () => {
    if (!profile || !partyModal || !partyForm.name.trim()) return;
    setPartySaving(true);
    try {
      const created = await createBuyerSupplier({
        name: partyForm.name.trim(),
        type: partyForm.type,
        address: partyForm.address || undefined,
        contact_info: partyForm.contact_info || undefined,
        linked_company_id: partyForm.linked_company_id ? Number(partyForm.linked_company_id) : undefined,
      });
      await addCompanyLink(profile.id, { party_id: created.data.id, relationship: partyModal });
      setPartyModal(null);
      load();
    } finally {
      setPartySaving(false);
    }
  };

  const openEditParty = (party: Party) => {
    setEditParty(party);
    setEditPartyForm({
      name: party.name,
      type: party.type,
      address: party.address ?? '',
      contact_info: party.contact_info ?? '',
      linked_company_id: party.linked_company_id ? String(party.linked_company_id) : '',
    });
  };

  const handleSaveEditParty = async () => {
    if (!editParty) return;
    setEditPartySaving(true);
    try {
      await updateBuyerSupplier(editParty.id, {
        name: editPartyForm.name.trim(),
        type: editPartyForm.type,
        address: editPartyForm.address || undefined,
        contact_info: editPartyForm.contact_info || undefined,
        linked_company_id: editPartyForm.linked_company_id ? Number(editPartyForm.linked_company_id) : undefined,
      });
      setEditParty(null);
      load();
    } finally {
      setEditPartySaving(false);
    }
  };

  const handleDeleteParty = async () => {
    if (!deleteParty || !profile) return;
    await deleteBuyerSupplier(deleteParty.party.id);
    setDeleteParty(null);
    load();
  };

  if (loading) return <Layout><div className="p-8 text-gray-400">Loading…</div></Layout>;
  if (!profile) return <Layout><div className="p-8 text-gray-500">Company not found.</div></Layout>;

  const tierStyle = profile.category ? TIER_STYLES[profile.category] : null;

  const PartyCard = ({ party, relationship }: { party: Party; relationship: string }) => (
    <div className="bg-white border border-gray-200 rounded-lg p-3 group hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{party.name}</p>
          {party.linked_company && (
            <button onClick={() => navigate(`/company-profiles/${party.linked_company!.id}`)}
              className="text-xs text-blue-600 hover:underline flex items-center gap-1 mt-0.5">
              <Link2 size={10} />{party.linked_company.company_name}
            </button>
          )}
          {party.address && <p className="text-xs text-gray-400 mt-1 truncate">{party.address}</p>}
          {party.contact_info && <p className="text-xs text-gray-400 truncate">{party.contact_info}</p>}
        </div>
        {canEdit && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <button onClick={() => openEditParty(party)} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600"><Pencil size={12} /></button>
            <button onClick={() => setDeleteParty({ party, relationship })} className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-red-600"><Trash2 size={12} /></button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Layout>
      {/* Top bar */}
      <div className="flex items-center justify-between px-8 py-4 bg-white border-b border-gray-200">
        <button onClick={() => navigate('/company-profiles')} className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors">
          <ArrowLeft size={15} /> Company Profiles
        </button>
        {canEdit && (
          <button onClick={openEdit} className="flex items-center gap-2 text-sm border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg text-gray-600 hover:text-gray-900 transition-colors">
            <Pencil size={13} /> Edit Profile
          </button>
        )}
      </div>

      {/* 3-column layout */}
      <div className="flex h-[calc(100vh-112px)] overflow-hidden">

        {/* LEFT — Suppliers */}
        <div className="w-72 shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Suppliers</p>
              <p className="text-xs text-gray-400">{profile.suppliers.length} linked</p>
            </div>
            {canEdit && (
              <button onClick={() => openAddParty('supplier')}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg transition-colors">
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {profile.suppliers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No suppliers linked</p>
            ) : (
              profile.suppliers.map(s => <PartyCard key={s.link_id} party={s} relationship="supplier" />)
            )}
          </div>
        </div>

        {/* CENTER — Company Profile */}
        <div className="flex-1 overflow-y-auto bg-white">
          <div className="max-w-md mx-auto px-8 py-8">

            {/* Logo */}
            <div className="flex flex-col items-center mb-6">
              <div className="relative group">
                {profile.logo_path ? (
                  <img src={`${API_BASE}/uploads/${profile.logo_path}`} alt="Company logo"
                    className="w-24 h-24 rounded-2xl object-cover border-2 border-gray-100 shadow-sm" />
                ) : (
                  <div className="w-24 h-24 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-bold text-2xl shadow-sm">
                    {profile.company_name.slice(0, 2).toUpperCase()}
                  </div>
                )}
                {canEdit && (
                  <button onClick={() => logoInputRef.current?.click()}
                    className="absolute inset-0 rounded-2xl bg-black/0 group-hover:bg-black/30 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-all text-xs font-medium">
                    Change
                  </button>
                )}
              </div>
              <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoChange} />

              {/* Badges */}
              <div className="mt-3 flex items-center gap-2 flex-wrap justify-center">
                {profile.category && tierStyle && (
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full border ${tierStyle.bg} ${tierStyle.text}`}>
                    {tierStyle.label}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1 rounded-full border ${
                  profile.is_active
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-gray-100 border-gray-200 text-gray-500'
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${profile.is_active ? 'bg-green-500' : 'bg-gray-400'}`} />
                  {profile.is_active ? 'Active' : 'Inactive'}
                </span>
                {profile.industry && (
                  <span className="text-xs bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1 rounded-full font-medium">
                    {profile.industry}
                  </span>
                )}
              </div>
            </div>

            {/* Company name */}
            <h1 className="text-xl font-bold text-gray-900 text-center mb-6 leading-tight">
              {profile.company_name}
            </h1>

            <div className="space-y-5">
              {/* Owner */}
              <div className="flex items-start gap-3">
                <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-gray-400 mb-0.5">Owner / Manager</p>
                  <p className="text-sm text-gray-800">{profile.owner_name || <span className="text-gray-400 italic">Not specified</span>}</p>
                </div>
              </div>

              {/* Address */}
              {profile.address && (
                <div className="flex items-start gap-3">
                  <MapPin size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Address</p>
                    <p className="text-sm text-gray-800 whitespace-pre-line">{profile.address}</p>
                  </div>
                </div>
              )}

              {/* Turnover */}
              {profile.turnover_aed != null && (
                <div className="flex items-start gap-3">
                  <TrendingUp size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Annual Turnover</p>
                    <p className="text-sm text-gray-800">
                      AED {Number(profile.turnover_aed).toLocaleString('en-AE', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                </div>
              )}

              <hr className="border-gray-100" />

              {/* Country */}
              {profile.country && (
                <div className="flex items-start gap-3">
                  <Globe size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Country</p>
                    <p className="text-sm text-gray-800">{profile.country}</p>
                  </div>
                </div>
              )}

              {/* Phone */}
              {profile.contact_phone && (
                <div className="flex items-start gap-3">
                  <Phone size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs text-gray-400 mb-0.5">Phone</p>
                    <p className="text-sm text-gray-800">{profile.contact_phone}</p>
                  </div>
                </div>
              )}

              {/* Emails */}
              {profile.contact_emails && (
                <div className="flex items-start gap-3">
                  <Mail size={15} className="text-gray-400 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400 mb-1.5">Email Addresses</p>
                    <div className="flex flex-wrap gap-1.5">
                      {profile.contact_emails.split(',').map(e => e.trim()).filter(Boolean).map(email => (
                        <span key={email} className="text-xs bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full">{email}</span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <hr className="border-gray-100" />

              {/* Company accounts */}
              <div className="flex items-start gap-3">
                <Landmark size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1.5">Company Accounts</p>
                  <AccountPillsWithStatus active={profile.company_active_accounts} inactive={profile.company_inactive_accounts} />
                </div>
              </div>

              {/* Personal accounts */}
              <div className="flex items-start gap-3">
                <User size={15} className="text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs text-gray-400 mb-1.5">Personal Accounts (Owner)</p>
                  <AccountPillsWithStatus active={profile.personal_active_accounts} inactive={profile.personal_inactive_accounts} />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Buyers */}
        <div className="w-72 shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Buyers</p>
              <p className="text-xs text-gray-400">{profile.buyers.length} linked</p>
            </div>
            {canEdit && (
              <button onClick={() => openAddParty('buyer')}
                className="flex items-center gap-1 text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1.5 rounded-lg transition-colors">
                <Plus size={12} /> Add
              </button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {profile.buyers.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">No buyers linked</p>
            ) : (
              profile.buyers.map(b => <PartyCard key={b.link_id} party={b} relationship="buyer" />)
            )}
          </div>
        </div>
      </div>

      {/* Edit Profile Modal */}
      {editMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Edit Company Profile</h2>
              <button onClick={() => setEditMode(false)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Company Name *</label>
                  <input value={editForm.company_name} onChange={e => setEditForm((f: any) => ({ ...f, company_name: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
                  <select value={editForm.category} onChange={e => setEditForm((f: any) => ({ ...f, category: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— None —</option>
                    <option value="A">A</option><option value="B">B</option><option value="C">C</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Industry</label>
                  <select value={industryEdit} onChange={e => setIndustryEdit(e.target.value)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— None —</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Country</label>
                  <select value={editForm.country} onChange={e => setEditForm((f: any) => ({ ...f, country: e.target.value }))}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                    <option value="">— Select —</option>
                    {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Owner Name</label>
                <input value={editForm.owner_name} onChange={e => setEditForm((f: any) => ({ ...f, owner_name: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <textarea value={editForm.address} onChange={e => setEditForm((f: any) => ({ ...f, address: e.target.value }))}
                  rows={2} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Annual Turnover (AED)</label>
                <input type="number" value={editForm.turnover_aed} onChange={e => setEditForm((f: any) => ({ ...f, turnover_aed: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>

              <BankStatusSelector label="Company Bank Accounts" banks={bankNames}
                activeAccounts={companyAccounts} inactiveAccounts={companyInactiveAccounts}
                onChangeActive={setCompanyAccounts} onChangeInactive={setCompanyInactiveAccounts} />
              <BankStatusSelector label="Personal Bank Accounts (Owner)" banks={bankNames}
                activeAccounts={personalAccounts} inactiveAccounts={personalInactiveAccounts}
                onChangeActive={setPersonalAccounts} onChangeInactive={setPersonalInactiveAccounts} />

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
                <input value={editForm.contact_phone} onChange={e => setEditForm((f: any) => ({ ...f, contact_phone: e.target.value }))}
                  placeholder="+971 50 000 0000"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-medium text-gray-600">Email Addresses</label>
                  <button type="button" onClick={() => setEmailList(l => [...l, ''])}
                    className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1">
                    <Plus size={11} /> Add email
                  </button>
                </div>
                <div className="space-y-2">
                  {emailList.map((email, i) => (
                    <div key={i} className="flex gap-2">
                      <input value={email} onChange={e => setEmailList(l => l.map((v, j) => j === i ? e.target.value : v))}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="email@company.com" type="email" />
                      {emailList.length > 1 && (
                        <button type="button" onClick={() => setEmailList(l => l.filter((_, j) => j !== i))}
                          className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-red-50"><X size={14} /></button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <label className="text-xs font-medium text-gray-600">Status</label>
                <button type="button" onClick={() => setEditForm((f: any) => ({ ...f, is_active: !f.is_active }))}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${editForm.is_active ? 'bg-green-500' : 'bg-gray-300'}`}>
                  <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${editForm.is_active ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </button>
                <span className={`text-xs font-medium ${editForm.is_active ? 'text-green-600' : 'text-gray-400'}`}>
                  {editForm.is_active ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setEditMode(false)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveEdit} disabled={saving}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50 transition-colors">
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Buyer / Supplier Modal */}
      {partyModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Add {partyModal === 'buyer' ? 'Buyer' : 'Supplier'}</h2>
              <button onClick={() => setPartyModal(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input value={partyForm.name} onChange={e => setPartyForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Company or person name"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select value={partyForm.type} onChange={e => setPartyForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="buyer">Buyer</option>
                  <option value="supplier">Supplier</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <input value={partyForm.address} onChange={e => setPartyForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Info</label>
                <input value={partyForm.contact_info} onChange={e => setPartyForm(f => ({ ...f, contact_info: e.target.value }))}
                  placeholder="Phone, email, etc."
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Link to Company Profile (optional)</label>
                <select value={partyForm.linked_company_id} onChange={e => setPartyForm(f => ({ ...f, linked_company_id: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— Not linked —</option>
                  {allProfiles.filter(p => p.id !== profile.id).map(p => (
                    <option key={p.id} value={p.id}>{p.company_name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setPartyModal(null)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={handleAddParty} disabled={!partyForm.name.trim() || partySaving}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                {partySaving ? 'Adding…' : `Add ${partyModal === 'buyer' ? 'Buyer' : 'Supplier'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Party Modal */}
      {editParty && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">Edit {editParty.name}</h2>
              <button onClick={() => setEditParty(null)} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>
            <div className="px-6 py-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input value={editPartyForm.name} onChange={e => setEditPartyForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                <select value={editPartyForm.type} onChange={e => setEditPartyForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="buyer">Buyer</option>
                  <option value="supplier">Supplier</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Address</label>
                <input value={editPartyForm.address} onChange={e => setEditPartyForm(f => ({ ...f, address: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Info</label>
                <input value={editPartyForm.contact_info} onChange={e => setEditPartyForm(f => ({ ...f, contact_info: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Link to Company Profile</label>
                <select value={editPartyForm.linked_company_id} onChange={e => setEditPartyForm(f => ({ ...f, linked_company_id: e.target.value }))}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="">— Not linked —</option>
                  {allProfiles.map(p => <option key={p.id} value={p.id}>{p.company_name}</option>)}
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={() => setEditParty(null)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSaveEditParty} disabled={!editPartyForm.name.trim() || editPartySaving}
                className="text-sm px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-50">
                {editPartySaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete party confirm */}
      {deleteParty && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Delete {deleteParty.party.name}?</h3>
            <p className="text-sm text-gray-500 mb-5">
              This will permanently delete this {deleteParty.relationship} and remove it from all companies.
            </p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDeleteParty(null)} className="text-sm px-4 py-2 rounded-lg border border-gray-200 hover:bg-gray-50">Cancel</button>
              <button onClick={handleDeleteParty} className="text-sm px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white">Delete</button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
