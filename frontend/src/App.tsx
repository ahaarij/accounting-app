import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { PrivateRoute } from './auth/PrivateRoute';
import Login from './pages/Login';
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

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />

          <Route path="/" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/import" element={<PrivateRoute><Import /></PrivateRoute>} />
          <Route path="/accounts/:id" element={<PrivateRoute><AccountDetail /></PrivateRoute>} />
          <Route path="/reconciliation" element={<PrivateRoute><ReconciliationReport /></PrivateRoute>} />
          <Route path="/cash-ledger" element={<PrivateRoute><CashTradeLedger /></PrivateRoute>} />
          <Route path="/flags" element={<PrivateRoute><FlagManagement /></PrivateRoute>} />
          <Route path="/users" element={<PrivateRoute adminOnly><UserManagement /></PrivateRoute>} />
          <Route path="/bank-statements" element={<PrivateRoute><BankStatements /></PrivateRoute>} />
          <Route path="/bank-statements/:id" element={<PrivateRoute><BankStatementDetail /></PrivateRoute>} />
          <Route path="/invoice-matching" element={<PrivateRoute><InvoiceMatching /></PrivateRoute>} />
          <Route path="/company-view" element={<PrivateRoute><CompanyView /></PrivateRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
