import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';

const SKIP_PREFIXES = ['/auth/login', '/health'];

function describe(method: string, url: string): { entity_type: string; description: string } {
  const base = url.split('?')[0];

  // Reconciliation
  if (base === '/reconciliation/run') return { entity_type: 'reconciliation', description: 'Ran reconciliation checks' };
  if (base === '/reconciliation/clear-all') return { entity_type: 'reconciliation', description: 'Cleared all reconciliation data' };
  if (/^\/reconciliation\/flags\/\d+\/resolve$/.test(base)) return { entity_type: 'reconciliation', description: 'Resolved reconciliation flag' };
  if (/^\/reconciliation\/results\/\d+$/.test(base) && method === 'DELETE') return { entity_type: 'reconciliation', description: 'Deleted reconciliation result' };

  // Imports
  if (/^\/import\/(group-a|group-b|transactions|cashflow)$/.test(base)) {
    const labels: Record<string, string> = { 'group-a': 'Group A balances', 'group-b': 'Group B balances', transactions: 'daily transactions', cashflow: 'daily cashflow' };
    const key = base.split('/')[2];
    return { entity_type: 'import', description: `Imported ${labels[key] ?? key} file` };
  }
  if (base === '/import/reset') return { entity_type: 'import', description: 'Reset all imported data' };
  if (base === '/sales/import') return { entity_type: 'import', description: 'Imported sales register' };

  // Cash deposits
  if (/^\/cash-deposits\/company-limits\/\d+$/.test(base)) return { entity_type: 'cash_deposit', description: 'Updated deposit limits' };
  if (base === '/cash-deposits' && method === 'POST') return { entity_type: 'cash_deposit', description: 'Added cash deposit' };
  if (/^\/cash-deposits\/\d+$/.test(base) && method === 'PATCH') return { entity_type: 'cash_deposit', description: 'Updated cash deposit' };
  if (/^\/cash-deposits\/\d+$/.test(base) && method === 'DELETE') return { entity_type: 'cash_deposit', description: 'Deleted cash deposit' };

  // Company profiles
  if (/^\/company-profiles\/\d+\/logo$/.test(base)) return { entity_type: 'company_profile', description: 'Uploaded company logo' };
  if (/^\/company-profiles\/\d+\/links$/.test(base) && method === 'POST') return { entity_type: 'company_profile', description: 'Linked party to company' };
  if (/^\/company-profiles\/\d+\/links\/\d+$/.test(base) && method === 'DELETE') return { entity_type: 'company_profile', description: 'Unlinked party from company' };
  if (base === '/company-profiles/parties/create' && method === 'POST') return { entity_type: 'buyer_supplier', description: 'Created buyer/supplier' };
  if (/^\/company-profiles\/parties\/\d+$/.test(base) && method === 'PATCH') return { entity_type: 'buyer_supplier', description: 'Updated buyer/supplier' };
  if (/^\/company-profiles\/parties\/\d+$/.test(base) && method === 'DELETE') return { entity_type: 'buyer_supplier', description: 'Deleted buyer/supplier' };
  if (base === '/company-profiles' && method === 'POST') return { entity_type: 'company_profile', description: 'Created company profile' };
  if (/^\/company-profiles\/\d+$/.test(base) && method === 'PATCH') return { entity_type: 'company_profile', description: 'Updated company profile' };
  if (/^\/company-profiles\/\d+$/.test(base) && method === 'DELETE') return { entity_type: 'company_profile', description: 'Deleted company profile' };

  // Users
  if (/^\/users\/\d+\/role$/.test(base)) return { entity_type: 'user', description: 'Updated user role' };
  if (/^\/users\/\d+\/status$/.test(base)) return { entity_type: 'user', description: 'Updated user status' };
  if (/^\/users\/\d+$/.test(base) && method === 'DELETE') return { entity_type: 'user', description: 'Deleted user' };
  if (base === '/auth/register') return { entity_type: 'user', description: 'Registered new user' };

  // Bank statements
  if (/^\/bank-statements\/accounts\/\d+\/pdf-password$/.test(base)) return { entity_type: 'bank_statement', description: 'Set PDF password' };
  if (base === '/bank-statements/import') return { entity_type: 'bank_statement', description: 'Imported CSV bank statement' };
  if (base === '/bank-statements/import-pdf') return { entity_type: 'bank_statement', description: 'Imported PDF bank statement' };
  if (/^\/bank-statements\/accounts\/\d+$/.test(base) && method === 'PATCH') return { entity_type: 'bank_statement', description: 'Updated bank account' };
  if (/^\/bank-statements\/accounts\/\d+$/.test(base) && method === 'DELETE') return { entity_type: 'bank_statement', description: 'Deleted bank account' };

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
        const { entity_type, description } = describe(method, url);
        this.auditService
          .log({ user_id: user?.sub, user_email: user?.email, user_name: user?.name, entity_type, description, ip_address: req.ip })
          .catch(() => {});
      }),
    );
  }
}
