import { ReactNode } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/utils';
import {
  LayoutDashboard, Upload, FileText, ArrowLeftRight,
  Flag, Users, LogOut, Landmark, ReceiptText, Building2, Settings, Coins, Briefcase, Banknote, ClipboardList, SlidersHorizontal,
} from 'lucide-react';

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin, canEdit } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const handleLogout = () => { logout(); navigate('/login'); };
  const inBankStatements = location.pathname.startsWith('/bank-statements') || ['/company-view', '/settings', '/cash'].includes(location.pathname);

  const roleBadge: Record<string, string> = {
    super_admin: 'Super Admin', admin: 'Admin', developer: 'Developer', user: 'User',
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <aside className="w-56 bg-slate-900 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-700">
          <p className="text-white font-semibold text-sm">Reconciliation</p>
          <p className="text-slate-400 text-xs mt-0.5">aarij co</p>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5 overflow-y-auto">
          {/* All roles */}
          {[
            { to: '/', label: 'Dashboard', icon: LayoutDashboard },
            { to: '/company-profiles', label: 'Companies', icon: Briefcase },
            { to: '/cash-deposits', label: 'Cash Tracker', icon: Banknote },
          ].map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}>
              <Icon size={16} />{label}
            </NavLink>
          ))}

          {/* Operational (admin, developer, super_admin) */}
          {canEdit && (
            <>
              {[
                { to: '/import', label: 'Import', icon: Upload },
                { to: '/flags', label: 'Flags', icon: Flag },
                { to: '/invoice-matching', label: 'Invoice Matching', icon: ReceiptText },
              { to: '/app-settings', label: 'Settings', icon: SlidersHorizontal },
              ].map(({ to, label, icon: Icon }) => (
                <NavLink key={to} to={to}
                  className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}>
                  <Icon size={16} />{label}
                </NavLink>
              ))}

              <div>
                <NavLink to="/bank-statements"
                  className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}>
                  <Landmark size={16} />Bank Statements
                </NavLink>
                {inBankStatements && (
                  <>
                    {[
                      { to: '/company-view', label: 'Company View', icon: Building2 },
                      { to: '/cash', label: 'Cash Ledger', icon: Coins },
                      { to: '/settings', label: 'Email Import', icon: Settings },
                    ].map(({ to, label, icon: Icon }) => (
                      <NavLink key={to} to={to}
                        className={({ isActive }) => cn('flex items-center gap-2 ml-4 pl-5 pr-3 py-1.5 rounded-lg text-xs transition-colors border-l border-slate-700',
                          isActive ? 'text-blue-400 bg-slate-800' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')}>
                        <Icon size={12} />{label}
                      </NavLink>
                    ))}
                  </>
                )}
              </div>
            </>
          )}

          {/* Management */}
          {isAdmin && (
            <NavLink to="/users"
              className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}>
              <Users size={16} />Users
            </NavLink>
          )}

          {/* Super admin only */}
          {user?.role === 'super_admin' && (
            <NavLink to="/audit-logs"
              className={({ isActive }) => cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                isActive ? 'bg-blue-600 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white')}>
              <ClipboardList size={16} />Audit Logs
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-slate-700">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.name || user?.email}</p>
              <p className="text-slate-400 text-xs truncate">{roleBadge[user?.role ?? ''] ?? user?.role}</p>
            </div>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 w-full px-2 py-1.5 text-slate-400 hover:text-white text-xs rounded-lg hover:bg-slate-800 transition-colors">
            <LogOut size={13} />Sign out
          </button>
          <p className="text-slate-600 text-xs text-center mt-2">v1.2 (WORK IN PROGRESS)</p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

export function PageHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between px-8 py-6 border-b border-gray-200 bg-white">
      <div>
        <h1 className="text-xl font-semibold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500 mt-0.5">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}
