import api from './client';
export { API_BASE } from './client';

// Auth
export const login = (email: string, password: string) =>
  api.post<{ access_token: string }>('/auth/login', { email, password });

export const register = (name: string, email: string, password: string, role: string) =>
  api.post<{ access_token: string }>('/auth/register', { name, email, password, role });

// Reconciliation
export const runReconciliation = (date?: string) =>
  api.post('/reconciliation/run', { date });

export const getSummary = (date?: string) =>
  api.get('/reconciliation/summary', { params: { date } });

export const getNetPosition = (days = 30) =>
  api.get<{ date: string; aed: number; usd: number }[]>('/reconciliation/net-position', { params: { days } });

export const getResults = (date?: string) =>
  api.get('/reconciliation/results', { params: { date } });

export const getFlags = (date?: string, resolved?: boolean) =>
  api.get('/reconciliation/flags', { params: { date, resolved } });

export const resolveFlag = (id: number, notes?: string) =>
  api.patch(`/reconciliation/flags/${id}/resolve`, { notes });

// Bank accounts
export const getBankAccounts = () => api.get('/bank-accounts');
export const getBankAccount = (id: number) => api.get(`/bank-accounts/${id}`);
export const getBankAccountTransactions = (id: number, page = 1) =>
  api.get(`/bank-accounts/${id}/transactions`, { params: { page } });
export const getBalanceWalk = (id: number, startDate?: string, endDate?: string) =>
  api.get(`/bank-accounts/${id}/balance-walk`, { params: { startDate, endDate } });

// Company view (CSV-based)
export const getCompanyNames = () => api.get<string[]>('/bank-statements/company-names');
export const getCompanyTransactions = (search: string, currency?: string, startDate?: string, endDate?: string, page = 1) =>
  api.get('/bank-statements/company-transactions', { params: { search, currency, startDate, endDate, page } });

// Daily transactions
export const getDailyTransactions = (date?: string) =>
  api.get('/daily-transactions', { params: { date } });

export const getCounterpartyLedger = (date?: string) =>
  api.get('/counterparty-ledger', { params: { date } });

// Users (admin only)
export const getUsers = () => api.get('/users');
export const createUser = (data: { name: string; email: string; password: string; role: string }) =>
  api.post('/auth/register', data);
export const updateUserRole = (id: number, role: string) =>
  api.patch(`/users/${id}/role`, { role });
export const deleteUser = (id: number) => api.delete(`/users/${id}`);

// Bank Statements (CSV)
export const getCsvAccounts = () => api.get('/bank-statements/accounts');
export const getCsvAccountsStats = (startDate?: string, endDate?: string) =>
  api.get('/bank-statements/accounts-stats', { params: { startDate, endDate } });
export const createCsvAccount = (data: { account_number: string; company_name: string; currency: string; bank_name: string }) =>
  api.post('/bank-statements/accounts', data);
export const updateCsvAccount = (id: number, data: Partial<{ account_number: string; company_name: string; currency: string; bank_name: string }>) =>
  api.patch(`/bank-statements/accounts/${id}`, data);
export const deleteCsvAccount = (id: number) => api.delete(`/bank-statements/accounts/${id}`);
export const getCsvTransactions = (id: number, page = 1, startDate?: string, endDate?: string) =>
  api.get(`/bank-statements/accounts/${id}/transactions`, { params: { page, startDate, endDate } });
export const importCsvFile = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/bank-statements/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const importPdfFile = (file: File, accountId?: number, password?: string) => {
  const form = new FormData();
  form.append('file', file);
  if (accountId) form.append('accountId', String(accountId));
  if (password) form.append('password', password);
  return api.post('/bank-statements/import-pdf', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const previewPdfFile = (file: File, password?: string) => {
  const form = new FormData();
  form.append('file', file);
  if (password) form.append('password', password);
  return api.post<{
    pages: number;
    text: string;
    lines: number;
    tables: Array<{ page: number; rows: string[][] }>;
  }>('/bank-statements/preview-pdf', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

export const setCsvAccountPdfPassword = (id: number, password: string) =>
  api.patch(`/bank-statements/accounts/${id}/pdf-password`, { password });

// Sales Invoices
export const importSalesRegister = (file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post('/sales/import', form, { headers: { 'Content-Type': 'multipart/form-data' } });
};
export const getSalesCustomerSummary = (company?: string, source?: 'excel' | 'csv') =>
  api.get('/sales/customer-summary', { params: { ...(company ? { company } : {}), ...(source && source !== 'excel' ? { source } : {}) } });
export const getSalesCompanies = () => api.get<string[]>('/sales/companies');

// Import
export const resetDatabase = () => api.delete('/import/reset');

export const importFile = (route: string, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post(`/import/${route}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
};

// Email Monitor (admin only)
export const getEmailConfig = () => api.get('/email-monitor/config');
export const saveEmailConfig = (data: {
  email: string;
  app_password: string;
  poll_interval_minutes?: number;
  is_active?: boolean;
  import_type?: string;
  sender_filter?: string;
}) => api.post('/email-monitor/config', data);
export const toggleEmailMonitor = () => api.post('/email-monitor/toggle');
export const testEmailPoll = () => api.post('/email-monitor/test');
export const getEmailStatus = () => api.get('/email-monitor/status');
export const getRecentEmailImports = () => api.get('/email-monitor/recent');
export const clearEmailImportLog = () => api.delete('/email-monitor/recent');

export const deleteReconResult = (id: number) => api.delete(`/reconciliation/results/${id}`);
export const clearReconData = () => api.delete('/reconciliation/clear-all');

// Audit logs (super_admin only)
export const getAuditLogs = (page = 1, limit = 100, entity_type?: string) =>
  api.get('/audit-logs', { params: { page, limit, ...(entity_type ? { entity_type } : {}) } });

// Cash ledger
export const getCashEntries = (currency?: string, startDate?: string, endDate?: string) =>
  api.get('/cash/entries', { params: { currency, startDate, endDate } });
export const createCashEntry = (dto: { date: string; description?: string; cash_in?: number; cash_out?: number; balance?: number; notes?: string; currency?: string }) =>
  api.post('/cash/entries', dto);
export const updateCashEntry = (id: number, dto: Partial<{ date: string; description: string; cash_in: number; cash_out: number; balance: number; notes: string; currency: string }>) =>
  api.patch(`/cash/entries/${id}`, dto);
export const deleteCashEntry = (id: number) => api.delete(`/cash/entries/${id}`);
export const deleteCashflowRow = (id: number) => api.delete(`/cash/cashflow/${id}`);
export const clearAllCashflow = () => api.delete('/cash/cashflow');
export const getCashflowSummary = (startDate?: string, endDate?: string) =>
  api.get('/cash/cashflow-summary', { params: { startDate, endDate } });

// Company Profiles
export const getCompanyProfiles = () => api.get('/company-profiles');
export const getCompanyProfile = (id: number) => api.get(`/company-profiles/${id}`);
export const createCompanyProfile = (dto: {
  category?: string; company_name: string; owner_name?: string;
  address?: string; turnover_aed?: number;
  company_active_accounts?: string; personal_active_accounts?: string;
  country?: string; is_active?: boolean;
  contact_emails?: string; contact_phone?: string; industry?: string;
}) => api.post('/company-profiles', dto);
export const updateCompanyProfile = (id: number, dto: Partial<{
  category: string; company_name: string; owner_name: string;
  address: string; turnover_aed: number;
  company_active_accounts: string; personal_active_accounts: string;
  country: string; is_active: boolean;
  contact_emails: string; contact_phone: string; industry: string;
}>) => api.patch(`/company-profiles/${id}`, dto);
export const deleteCompanyProfile = (id: number) => api.delete(`/company-profiles/${id}`);
export const uploadCompanyLogo = (id: number, file: File) => {
  const form = new FormData();
  form.append('logo', file);
  return api.post(`/company-profiles/${id}/logo`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
};

// Buyers & Suppliers
export const getBuyersSuppliers = () => api.get('/company-profiles/parties/all');
export const createBuyerSupplier = (dto: {
  name: string; type?: string; address?: string; contact_info?: string; linked_company_id?: number;
}) => api.post('/company-profiles/parties/create', dto);
export const updateBuyerSupplier = (id: number, dto: Partial<{
  name: string; type: string; address: string; contact_info: string; linked_company_id: number;
}>) => api.patch(`/company-profiles/parties/${id}`, dto);
export const deleteBuyerSupplier = (id: number) => api.delete(`/company-profiles/parties/${id}`);

// Company <-> Buyer/Supplier links
export const addCompanyLink = (companyId: number, dto: { party_id: number; relationship: string }) =>
  api.post(`/company-profiles/${companyId}/links`, dto);
export const removeCompanyLink = (companyId: number, linkId: number) =>
  api.delete(`/company-profiles/${companyId}/links/${linkId}`);
