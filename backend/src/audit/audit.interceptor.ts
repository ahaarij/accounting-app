import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const SKIP_PREFIXES = ['/auth/login', '/health'];

function fmt(n: any): string {
  const num = parseFloat(n);
  if (isNaN(num)) return String(n ?? '');
  return new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
}

function idFromUrl(url: string, segment: string): string | null {
  const m = url.match(new RegExp(`/${segment}/(\\d+)`));
  return m ? m[1] : null;
}

function describe(
  method: string,
  url: string,
  body: Record<string, any>,
): { entity_type: string; description: string } {
  const base = url.split('?')[0];

  // ── Reconciliation ──────────────────────────────────────────────────────────
  if (base === '/reconciliation/run')
    return { entity_type: 'reconciliation', description: 'Ran all reconciliation checks' };
  if (base === '/reconciliation/clear-all')
    return { entity_type: 'reconciliation', description: 'Cleared all reconciliation results and flags' };
  if (/^\/reconciliation\/flags\/\d+\/resolve$/.test(base)) {
    const id = idFromUrl(base, 'flags');
    const note = body?.notes ? ` — note: "${body.notes}"` : '';
    return { entity_type: 'reconciliation', description: `Resolved reconciliation flag #${id}${note}` };
  }
  if (/^\/reconciliation\/results\/\d+$/.test(base) && method === 'DELETE') {
    const id = idFromUrl(base, 'results');
    return { entity_type: 'reconciliation', description: `Deleted reconciliation result #${id}` };
  }

  // ── Imports ─────────────────────────────────────────────────────────────────
  if (/^\/import\/(group-a|group-b|transactions|cashflow)$/.test(base)) {
    const labels: Record<string, string> = {
      'group-a': 'Group A balances', 'group-b': 'Group B balances',
      transactions: 'daily transactions', cashflow: 'daily cashflow',
    };
    const key = base.split('/')[2];
    return { entity_type: 'import', description: `Imported ${labels[key] ?? key} Excel file` };
  }
  if (base === '/import/reset')
    return { entity_type: 'import', description: 'Reset ALL imported Excel data — all balances and transactions wiped' };
  if (base === '/sales/import')
    return { entity_type: 'import', description: 'Imported sales register file' };

  // ── Excel Balance ───────────────────────────────────────────────────────────
  if (base === '/excel-balance/import')
    return { entity_type: 'excel_balance', description: 'Imported Excel balance file (Group A or B)' };
  if (/^\/excel-balance\/imports\/\d+$/.test(base) && method === 'DELETE') {
    const id = idFromUrl(base, 'imports');
    return { entity_type: 'excel_balance', description: `Deleted Excel import #${id}` };
  }
  if (base === '/excel-balance/all' && method === 'DELETE')
    return { entity_type: 'excel_balance', description: 'Deleted ALL Excel balance data — accounts and transactions wiped' };

  // ── Cash Deposits ───────────────────────────────────────────────────────────
  if (/^\/cash-deposits\/company-limits\/\d+$/.test(base) && method === 'PATCH') {
    const id = idFromUrl(base, 'company-limits');
    const monthly = body?.monthly_limit != null ? `monthly limit = AED ${fmt(body.monthly_limit)}` : '';
    const perTx = body?.per_tx_limit != null ? `per-tx limit = AED ${fmt(body.per_tx_limit)}` : '';
    const detail = [monthly, perTx].filter(Boolean).join(', ');
    return { entity_type: 'cash_deposit', description: `Updated deposit limits for company #${id}${detail ? ': ' + detail : ''}` };
  }
  if (base === '/cash-deposits' && method === 'POST') {
    const amount = body?.amount != null ? `AED ${fmt(body.amount)}` : '';
    const desc = body?.description ? ` — "${body.description}"` : '';
    const date = body?.date ? ` on ${body.date}` : '';
    return { entity_type: 'cash_deposit', description: `Added cash deposit${amount ? ' ' + amount : ''}${desc}${date}` };
  }
  if (/^\/cash-deposits\/\d+$/.test(base) && method === 'PATCH') {
    const id = idFromUrl(base, 'cash-deposits');
    const amount = body?.amount != null ? ` → AED ${fmt(body.amount)}` : '';
    const desc = body?.description ? ` — "${body.description}"` : '';
    return { entity_type: 'cash_deposit', description: `Updated deposit #${id}${amount}${desc}` };
  }
  if (/^\/cash-deposits\/\d+$/.test(base) && method === 'DELETE') {
    const id = idFromUrl(base, 'cash-deposits');
    return { entity_type: 'cash_deposit', description: `Deleted deposit #${id}` };
  }

  // ── Company Profiles ────────────────────────────────────────────────────────
  if (base === '/company-profiles' && method === 'POST') {
    const name = body?.company_name ? ` — "${body.company_name}"` : '';
    return { entity_type: 'company_profile', description: `Created company profile${name}` };
  }
  if (/^\/company-profiles\/\d+$/.test(base) && method === 'PATCH') {
    const id = idFromUrl(base, 'company-profiles');
    const name = body?.company_name ? ` "${body.company_name}"` : ` #${id}`;
    return { entity_type: 'company_profile', description: `Updated company profile${name}` };
  }
  if (/^\/company-profiles\/\d+$/.test(base) && method === 'DELETE') {
    const id = idFromUrl(base, 'company-profiles');
    return { entity_type: 'company_profile', description: `Deleted company profile #${id}` };
  }
  if (/^\/company-profiles\/\d+\/logo$/.test(base))
    return { entity_type: 'company_profile', description: `Uploaded logo for company #${idFromUrl(base, 'company-profiles')}` };
  if (/^\/company-profiles\/\d+\/links$/.test(base) && method === 'POST') {
    const name = body?.name ? ` "${body.name}"` : '';
    return { entity_type: 'company_profile', description: `Linked party${name} to company #${idFromUrl(base, 'company-profiles')}` };
  }
  if (/^\/company-profiles\/\d+\/links\/\d+$/.test(base) && method === 'DELETE')
    return { entity_type: 'company_profile', description: `Unlinked party from company #${idFromUrl(base, 'company-profiles')}` };
  if (base === '/company-profiles/parties/create' && method === 'POST') {
    const name = body?.name ? ` — "${body.name}"` : '';
    return { entity_type: 'buyer_supplier', description: `Created buyer/supplier${name}` };
  }
  if (/^\/company-profiles\/parties\/\d+$/.test(base) && method === 'PATCH') {
    const id = idFromUrl(base, 'parties');
    const name = body?.name ? ` "${body.name}"` : ` #${id}`;
    return { entity_type: 'buyer_supplier', description: `Updated buyer/supplier${name}` };
  }
  if (/^\/company-profiles\/parties\/\d+$/.test(base) && method === 'DELETE') {
    const id = idFromUrl(base, 'parties');
    return { entity_type: 'buyer_supplier', description: `Deleted buyer/supplier #${id}` };
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  if (base === '/auth/register') {
    const who = body?.name && body?.email ? ` — ${body.name} (${body.email})` : body?.email ? ` — ${body.email}` : '';
    return { entity_type: 'user', description: `New user registration${who}` };
  }
  if (/^\/users\/\d+\/role$/.test(base)) {
    const id = idFromUrl(base, 'users');
    const role = body?.role ? ` → "${body.role}"` : '';
    return { entity_type: 'user', description: `Changed role for user #${id}${role}` };
  }
  if (/^\/users\/\d+\/status$/.test(base)) {
    const id = idFromUrl(base, 'users');
    const status = body?.status ? ` → "${body.status}"` : '';
    return { entity_type: 'user', description: `Changed status for user #${id}${status}` };
  }
  if (/^\/users\/\d+$/.test(base) && method === 'DELETE') {
    const id = idFromUrl(base, 'users');
    return { entity_type: 'user', description: `Deleted user #${id}` };
  }

  // ── Bank Statements ─────────────────────────────────────────────────────────
  if (base === '/bank-statements/import')
    return { entity_type: 'bank_statement', description: 'Imported CSV bank statement' };
  if (base === '/bank-statements/import-pdf')
    return { entity_type: 'bank_statement', description: 'Imported PDF bank statement' };
  if (/^\/bank-statements\/accounts\/\d+\/pdf-password$/.test(base)) {
    const id = idFromUrl(base, 'accounts');
    return { entity_type: 'bank_statement', description: `Set PDF password for bank account #${id}` };
  }
  if (/^\/bank-statements\/accounts\/\d+$/.test(base) && method === 'PATCH') {
    const id = idFromUrl(base, 'accounts');
    return { entity_type: 'bank_statement', description: `Updated bank account #${id}` };
  }
  if (/^\/bank-statements\/accounts\/\d+$/.test(base) && method === 'DELETE') {
    const id = idFromUrl(base, 'accounts');
    return { entity_type: 'bank_statement', description: `Deleted bank account #${id}` };
  }
  if (base === '/bank-statements/transactions/all' && method === 'DELETE')
    return { entity_type: 'bank_statement', description: 'Deleted ALL bank statement transactions' };

  return { entity_type: 'other', description: `${method} ${base}` };
}

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const { method, url } = req;

    if (!['POST', 'PATCH', 'DELETE'].includes(method)) return next.handle();
    if (SKIP_PREFIXES.some((p) => url.startsWith(p))) return next.handle();

    return next.handle().pipe(
      tap(() => {
        const user = req.user;
        const body: Record<string, any> = req.body ?? {};
        const { entity_type, description } = describe(method, url, body);
        this.auditService
          .log({ user_id: user?.sub, user_email: user?.email, user_name: user?.name, entity_type, description, ip_address: req.ip })
          .catch(() => {});
      }),
    );
  }
}
