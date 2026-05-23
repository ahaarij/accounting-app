import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { SalesInvoice } from '../entities/sales-invoice.entity';
import { SalesRegisterParser } from './parsers/sales-register.parser';

@Injectable()
export class SalesService {
  private readonly logger = new Logger(SalesService.name);

  constructor(
    @InjectRepository(SalesInvoice)
    private readonly invoiceRepo: Repository<SalesInvoice>,
    private readonly dataSource: DataSource,
    private readonly parser: SalesRegisterParser,
  ) {}

  // ── Import ────────────────────────────────────────────────────────────────

  async importSalesRegister(filePath: string, filename: string) {
    const errors: string[] = [];
    let records = 0;
    let skipped = 0;
    const today = new Date().toISOString().substring(0, 10);
    try {
      const invoices = this.parser.parse(filePath);
      const sourceCompany = invoices[0]?.source_company ?? 'unknown';
      this.logger.log(`SalesRegister [${sourceCompany}]: ${invoices.length} rows`);
      for (const inv of invoices) {
        const existing = await this.invoiceRepo.findOne({
          where: { source_company: inv.source_company, voucher_no: inv.voucher_no, invoice_date: inv.invoice_date, gross_total: inv.gross_total },
        });
        if (existing) { skipped++; continue; }
        await this.invoiceRepo.save(this.invoiceRepo.create({ ...inv, filename, import_date: today }));
        records++;
      }
      return { records, skipped, source_company: invoices[0]?.source_company ?? 'unknown', errors };
    } catch (e) {
      errors.push(String(e));
      return { records, skipped, source_company: 'unknown', errors };
    }
  }

  // ── Main report: FIFO allocation of deposits → invoices ──────────────────

  async getCustomerSummary(sourceCompany?: string, source: 'excel' | 'csv' = 'excel') {
    // 1. Get all non-cancelled invoices grouped by customer
    const invoiceGroups: any[] = await this.dataSource.query(`
      SELECT customer_name, source_company,
        MIN(invoice_date) AS first_invoice,
        MAX(invoice_date) AS last_invoice,
        json_agg(json_build_object(
          'id', id, 'voucher_no', voucher_no,
          'invoice_date', invoice_date, 'gross_total', gross_total, 'product', product
        ) ORDER BY invoice_date ASC, id ASC) AS invoices
      FROM sales_invoices
      WHERE is_cancelled = false AND gross_total IS NOT NULL AND invoice_date IS NOT NULL
        ${sourceCompany ? `AND source_company = '${sourceCompany}'` : ''}
      GROUP BY customer_name, source_company
      ORDER BY SUM(gross_total) DESC NULLS LAST
    `);

    const customers: any[] = [];
    for (const grp of invoiceGroups) {
      const keywords = this.extractKeywords(grp.customer_name);
      const deposits = keywords.length
        ? (source === 'csv'
            ? await this.getDepositsFromCSV(keywords, grp.source_company)
            : await this.getDepositsForCustomer(keywords, grp.source_company))
        : [];

      // FIFO: allocate deposits (oldest first) against invoices (oldest first)
      const { invoices, unallocated } = this.fifoAllocate(grp.invoices, deposits);

      const totalInvoiced    = invoices.reduce((s: number, i: any) => s + parseFloat(i.gross_total), 0);
      const totalReceived    = invoices.reduce((s: number, i: any) => s + i.received, 0);
      const totalOutstanding = invoices.reduce((s: number, i: any) => s + i.outstanding, 0);

      customers.push({
        customer_name:  grp.customer_name,
        source_company: grp.source_company,
        invoice_count:  invoices.length,
        first_invoice:  grp.first_invoice,
        last_invoice:   grp.last_invoice,
        total_invoiced:    parseFloat(totalInvoiced.toFixed(2)),
        total_received:    parseFloat(totalReceived.toFixed(2)),
        total_outstanding: parseFloat(totalOutstanding.toFixed(2)),
        invoices,
        unallocated_deposits: unallocated,
        status: totalOutstanding <= 0 ? 'paid' : totalReceived > 0 ? 'partial' : 'unpaid',
      });
    }

    // 2. Find deposits from entities with NO invoice at all
    const uninvoiced = await this.getUninvoicedDeposits(invoiceGroups);

    const totalInvoiced   = customers.reduce((s, c) => s + c.total_invoiced, 0);
    const totalReceived   = customers.reduce((s, c) => s + c.total_received, 0);
    const totalOutstanding = customers.reduce((s, c) => s + c.total_outstanding, 0);

    return {
      customers,
      uninvoiced_deposits: uninvoiced,
      summary: {
        total_invoiced:           parseFloat(totalInvoiced.toFixed(2)),
        total_received:           parseFloat(totalReceived.toFixed(2)),
        total_outstanding:        parseFloat(totalOutstanding.toFixed(2)),
        customers_unpaid:         customers.filter(c => c.status === 'unpaid').length,
        customers_partial:        customers.filter(c => c.status === 'partial').length,
        customers_overpaid:       customers.filter(c => c.status === 'overpaid' || c.status === 'paid').length,
        uninvoiced_deposit_count: uninvoiced.length,
      },
    };
  }

  // ── FIFO allocation ───────────────────────────────────────────────────────

  private fifoAllocate(invoices: any[], deposits: any[]) {
    // Deep copy with mutable state
    const invList = invoices.map(inv => ({
      ...inv,
      gross_total:  parseFloat(inv.gross_total),
      outstanding:  parseFloat(inv.gross_total),
      received:     0,
      transactions: [] as any[],
      status:       'unpaid' as string,
    }));

    const USD_RATE = 3.6725;
    const EUR_RATE = 4.08;
    const depList = deposits.map(dep => {
      const raw = parseFloat(dep.deposit || '0');
      const aed = dep.currency === 'USD' ? parseFloat((raw * USD_RATE).toFixed(2))
                : dep.currency === 'EUR' ? parseFloat((raw * EUR_RATE).toFixed(2))
                : raw;
      return { ...dep, deposit: raw, deposit_aed: aed, remaining: aed };
    });

    for (const dep of depList) {
      for (const inv of invList) {
        if (inv.outstanding <= 0 || dep.remaining <= 0) continue;
        const depDate = String(dep.date).substring(0, 10);
        const invDate = String(inv.invoice_date).substring(0, 10);
        // Allow deposits up to 60 days before invoice (prepayments) and up to 120 days after
        const earliest = new Date(invDate + 'T00:00:00Z');
        earliest.setUTCDate(earliest.getUTCDate() - 60);
        if (depDate < earliest.toISOString().substring(0, 10)) continue;
        const cutoff = new Date(invDate + 'T00:00:00Z');
        cutoff.setUTCDate(cutoff.getUTCDate() + 120);
        if (depDate > cutoff.toISOString().substring(0, 10)) continue;
        const applied = parseFloat(Math.min(inv.outstanding, dep.remaining).toFixed(2));
        inv.outstanding  = parseFloat((inv.outstanding - applied).toFixed(2));
        inv.received     = parseFloat((inv.received    + applied).toFixed(2));
        dep.remaining    = parseFloat((dep.remaining   - applied).toFixed(2));
        inv.transactions.push({
          id:           dep.id,
          date:         dep.date,
          particular:   dep.particular,
          bank_name:    dep.bank_name,
          account_name: dep.account_name,
          currency:     dep.currency,
          deposit:      dep.deposit,
          deposit_aed:  dep.deposit_aed,
          applied,
        });
      }
    }

    for (const inv of invList) {
      inv.status = inv.outstanding <= 0 ? 'paid'
        : inv.received > 0 ? 'partial'
        : 'unpaid';
    }

    const unallocated = depList.filter(d => d.remaining > 0.01);
    return { invoices: invList, unallocated };
  }

  // ── Deposits for a customer ───────────────────────────────────────────────

  private async getDepositsForCustomer(keywords: string[], sourceCompany?: string): Promise<any[]> {
    const conditions = keywords.map((_, i) => `LOWER(at.particular) LIKE $${i + 1}`).join(' OR ');
    const params = keywords.map(k => `%${k.toLowerCase()}%`);
    // First word of slug: 'caps_lock' → 'caps', 'pinnacle' → 'pinnacle'
    const slugWord = sourceCompany ? sourceCompany.split('_')[0] : '';
    params.push(`%${slugWord}%`);
    const ownIdx = params.length;
    // Restrict to accounts belonging to the same company group (payments only go to own accounts)
    const companyClause = slugWord ? `AND LOWER(c.name) LIKE $${ownIdx}` : '';
    return this.dataSource.query(`
      SELECT * FROM (
        SELECT DISTINCT ON (at.date, at.deposit, at.particular)
               at.id, at.date::text AS date, at.deposit, at.particular,
               ba.bank_name, ba.currency, c.name AS account_name,
               (LOWER(c.name) LIKE $${ownIdx}) AS is_own_company
        FROM account_transactions at
        JOIN bank_accounts ba ON ba.id = at.bank_account_id
        JOIN companies c      ON c.id  = ba.company_id
        WHERE at.deposit IS NOT NULL AND at.deposit > 0 AND (${conditions})
        ${companyClause}
        ORDER BY at.date, at.deposit, at.particular, (LOWER(c.name) LIKE $${ownIdx}) DESC, at.id
      ) sub
      ORDER BY is_own_company DESC, date ASC, id ASC
    `, params);
  }

  private async getDepositsFromCSV(keywords: string[], sourceCompany?: string): Promise<any[]> {
    const conditions = keywords.map((_, i) => `LOWER(ct.description) LIKE $${i + 1}`).join(' OR ');
    const params = keywords.map(k => `%${k.toLowerCase()}%`);
    const slugWord = sourceCompany ? sourceCompany.split('_')[0] : '';
    const companyClause = slugWord ? `AND LOWER(ca.company_name) LIKE $${params.length + 1}` : '';
    if (slugWord) params.push(`%${slugWord}%`);
    return this.dataSource.query(`
      SELECT DISTINCT ON (ct.date, ct.credit, ct.description)
             ct.id, ct.date::text AS date, ct.credit AS deposit, ct.description AS particular,
             ca.bank_name, ca.currency, ca.company_name AS account_name
      FROM csv_transactions ct
      JOIN csv_accounts ca ON ca.id = ct.csv_account_id
      WHERE ct.credit IS NOT NULL AND ct.credit > 0 AND (${conditions})
      ${companyClause}
      ORDER BY ct.date, ct.credit, ct.description, ct.id
    `, params);
  }

  // ── Uninvoiced deposits ───────────────────────────────────────────────────

  private async getUninvoicedDeposits(invoiceGroups: any[]): Promise<any[]> {
    const allKeywords: string[] = [];
    for (const g of invoiceGroups) allKeywords.push(...this.extractKeywords(g.customer_name));

    const rows: any[] = await this.dataSource.query(`
      SELECT at.id, at.date, at.deposit, at.particular,
             ba.bank_name, c.name AS account_name
      FROM account_transactions at
      JOIN bank_accounts ba ON ba.id = at.bank_account_id
      JOIN companies c      ON c.id  = ba.company_id
      WHERE at.deposit IS NOT NULL AND at.deposit >= 50000
      ORDER BY at.deposit DESC
    `);

    // Get group company names (short forms) to exclude intergroup noise
    const groupCos: any[] = await this.dataSource.query(`SELECT LOWER(name) AS name FROM companies`);
    const groupShort = groupCos.map((c: any) => (c.name as string).split(' ').slice(0, 2).join(' ')).filter(n => n.length > 4);

    return rows.filter(dep => {
      const p = (dep.particular || '').toLowerCase();
      if (allKeywords.some(kw => p.includes(kw))) return false;  // already has invoice
      if (groupShort.some(gs => p.includes(gs))) return false;   // intergroup transfer
      return true;
    });
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private extractKeywords(customerName: string): string[] {
    if (!customerName) return [];
    const stop = new Set(['llc', 'ltd', 'limited', 'fz', 'fze', 'fzco', 'trading',
      'general', 'goods', 'wholesalers', 'international', 'and', 'the', 'of',
      'dwc', 'global', 'group', 'groups', 'inc', 'co', 'corp']);
    const words = customerName.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/)
      .filter(w => w.length > 2 && !stop.has(w));
    if (!words.length) return [];
    return words.length >= 2 ? [`${words[0]} ${words[1]}`, words[0]] : [words[0]];
  }

  async getImportedCompanies(): Promise<string[]> {
    const rows = await this.invoiceRepo.createQueryBuilder('si')
      .select('DISTINCT si.source_company', 'source_company').getRawMany();
    return rows.map(r => r.source_company);
  }

  async resetInvoices(): Promise<void> {
    await this.invoiceRepo.clear();
  }
}
