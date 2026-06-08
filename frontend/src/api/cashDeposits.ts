import api from './client';

export function fetchCashDeposits(from: string, to: string) {
  return api.get(`/cash-deposits?from=${from}&to=${to}`).then((r) => r.data);
}

export function createCashDeposit(dto: {
  company_id: number;
  bank_account: string | null;
  date: string;
  description: string;
  amount: number;
  currency?: string;
}) {
  return api.post('/cash-deposits', dto).then((r) => r.data);
}

export function updateCashDeposit(
  id: number,
  dto: { date?: string; description?: string; amount?: number },
) {
  return api.patch(`/cash-deposits/${id}`, dto).then((r) => r.data);
}

export function deleteCashDeposit(id: number) {
  return api.delete(`/cash-deposits/${id}`).then((r) => r.data);
}

export function updateCompanyDepositLimits(
  companyId: number,
  bankAccount: string | null,
  dto: { per_tx_limit?: number; monthly_limit?: number },
) {
  return api
    .patch(`/cash-deposits/company-limits/${companyId}`, { bank_account: bankAccount, ...dto })
    .then((r) => r.data);
}
