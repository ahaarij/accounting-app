import api from './client';

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
