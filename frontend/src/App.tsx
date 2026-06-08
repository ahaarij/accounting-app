import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PrivateRoute } from './auth/PrivateRoute';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Import from './pages/Import';
import AccountDetail from './pages/AccountDetail';
import ReconciliationReport from './pages/ReconciliationReport';
import CashTradeLedger from './pages/CashTradeLedger';
import FlagManagement from './pages/FlagManagement';
import UserManagement from './pages/UserManagement';
import BankStatements from './pages/BankStatements';
import BankStatementDetail from './pages/BankStatementDetail';
import InvoiceMatching from './pages/InvoiceMatching';
import CompanyView from './pages/CompanyView';
import Settings from './pages/Settings';
import AccountsList from './pages/AccountsList';
import CashLedger from './pages/CashLedger';
import CompanyProfiles from './pages/CompanyProfiles';
import CompanyProfileDetail from './pages/CompanyProfileDetail';
import CashDepositsTracker from './pages/CashDepositsTracker';
import AuditLogs from './pages/AuditLogs';

// Roles allowed to access operational pages (not plain users)
const OPS = ['super_admin', 'admin', 'developer'] as const;
// Only super_admin and admin can manage users
const MGMT = ['super_admin', 'admin'] as const;

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Public */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* All authenticated roles */}
          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/company-profiles" element={<PrivateRoute><CompanyProfiles /></PrivateRoute>} />
          <Route path="/company-profiles/:id" element={<PrivateRoute><CompanyProfileDetail /></PrivateRoute>} />
          <Route path="/cash-deposits" element={<PrivateRoute><CashDepositsTracker /></PrivateRoute>} />

          {/* Operational — super_admin, admin, developer */}
          <Route path="/import" element={<PrivateRoute roles={[...OPS]}><Import /></PrivateRoute>} />
          <Route path="/accounts/:id" element={<PrivateRoute roles={[...OPS]}><AccountDetail /></PrivateRoute>} />
          <Route path="/reconciliation" element={<PrivateRoute roles={[...OPS]}><ReconciliationReport /></PrivateRoute>} />
          <Route path="/cash-ledger" element={<PrivateRoute roles={[...OPS]}><CashTradeLedger /></PrivateRoute>} />
          <Route path="/flags" element={<PrivateRoute roles={[...OPS]}><FlagManagement /></PrivateRoute>} />
          <Route path="/bank-statements" element={<PrivateRoute roles={[...OPS]}><BankStatements /></PrivateRoute>} />
          <Route path="/bank-statements/:id" element={<PrivateRoute roles={[...OPS]}><BankStatementDetail /></PrivateRoute>} />
          <Route path="/invoice-matching" element={<PrivateRoute roles={[...OPS]}><InvoiceMatching /></PrivateRoute>} />
          <Route path="/company-view" element={<PrivateRoute roles={[...OPS]}><CompanyView /></PrivateRoute>} />
          <Route path="/account-group/:type" element={<PrivateRoute roles={[...OPS]}><AccountsList /></PrivateRoute>} />
          <Route path="/cash" element={<PrivateRoute roles={[...OPS]}><CashLedger /></PrivateRoute>} />
          <Route path="/settings" element={<PrivateRoute roles={[...OPS]}><Settings /></PrivateRoute>} />

          {/* Management — super_admin, admin only */}
          <Route path="/users" element={<PrivateRoute roles={[...MGMT]}><UserManagement /></PrivateRoute>} />

          {/* Super admin only */}
          <Route path="/audit-logs" element={<PrivateRoute roles={['super_admin']}><AuditLogs /></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
