import { ReactNode } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { cn } from '../lib/utils';
import {
  LayoutDashboard, Upload, FileText, ArrowLeftRight,
  Flag, Users, LogOut, ChevronRight, Landmark, ReceiptText, Building2,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/import', label: 'Import', icon: Upload },
  { to: '/reconciliation', label: 'Recon Report', icon: FileText },
  { to: '/cash-ledger', label: 'Cash Ledger', icon: ArrowLeftRight },
  { to: '/flags', label: 'Flags', icon: Flag },
  { to: '/bank-statements', label: 'Bank Statements', icon: Landmark },
  { to: '/invoice-matching', label: 'Invoice Matching', icon: ReceiptText },
];

export function Layout({ children }: { children: ReactNode }) {
  const { user, logout, isAdmin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = () => { logout(); navigate('/login'); };

  const inBankStatements = location.pathname.startsWith('/bank-statements') || location.pathname === '/company-view';

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="w-56 bg-slate-900 flex flex-col">
        <div className="px-5 py-5 border-b border-slate-700">
          <p className="text-white font-semibold text-sm">Reconciliation</p>
          <p className="text-slate-400 text-xs mt-0.5">aarij co</p>
        </div>

        <nav className="flex-1 py-4 px-2 space-y-0.5">
          {navItems.map(({ to, label, icon: Icon }) => (
            <div key={to}>
              <NavLink
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white')
                }
              >
                <Icon size={16} />
                {label}
              </NavLink>
              {to === '/bank-statements' && inBankStatements && (
                <NavLink
                  to="/company-view"
                  className={({ isActive }) =>
                    cn('flex items-center gap-2 ml-4 pl-5 pr-3 py-1.5 rounded-lg text-xs transition-colors border-l border-slate-700',
                      isActive
                        ? 'text-blue-400 bg-slate-800'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800')
                  }
                >
                  <Building2 size={12} />
                  Company View
                </NavLink>
              )}
            </div>
          ))}

          {isAdmin && (
            <NavLink
              to="/users"
              className={({ isActive }) =>
                cn('flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white')
              }
            >
              <Users size={16} />
              Users
            </NavLink>
          )}
        </nav>

        <div className="px-3 py-4 border-t border-slate-700">
          <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
            <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-semibold">
              {user?.email?.[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-xs font-medium truncate">{user?.email}</p>
              <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg text-sm transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
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

export function Breadcrumb({ items }: { items: { label: string; to?: string }[] }) {
  return (
    <nav className="flex items-center gap-1 px-8 py-3 text-sm text-gray-500 bg-white border-b border-gray-100">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight size={12} />}
          <span className={i === items.length - 1 ? 'text-gray-900 font-medium' : ''}>{item.label}</span>
        </span>
      ))}
    </nav>
  );
}
