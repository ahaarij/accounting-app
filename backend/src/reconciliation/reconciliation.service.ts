import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ReconciliationResult } from '../entities/reconciliation-result.entity';
import { ReconciliationFlag } from '../entities/reconciliation-flag.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { AccountTransaction } from '../entities/account-transaction.entity';
import { DailyTransaction } from '../entities/daily-transaction.entity';
import { CounterpartyLedger } from '../entities/counterparty-ledger.entity';
import { ImportLog } from '../entities/import-log.entity';
import { Company } from '../entities/company.entity';

export interface ReconciliationRunResult {
  results_created: number;
  flags_created: number;
  discrepancies: number;
  critical_flags: number;
  warning_flags: number;
  info_flags: number;
  checks_run: string[];
}

@Injectable()
export class ReconciliationService {
  private readonly logger = new Logger(ReconciliationService.name);

  constructor(
    @InjectRepository(ReconciliationResult)
    private resultRepo: Repository<ReconciliationResult>,
    @InjectRepository(ReconciliationFlag)
    private flagRepo: Repository<ReconciliationFlag>,
    @InjectRepository(BankAccount)
    private bankAccountRepo: Repository<BankAccount>,
    @InjectRepository(AccountTransaction)
    private accountTxRepo: Repository<AccountTransaction>,
    @InjectRepository(DailyTransaction)
    private dailyTxRepo: Repository<DailyTransaction>,
    @InjectRepository(CounterpartyLedger)
    private counterpartyRepo: Repository<CounterpartyLedger>,
    @InjectRepository(ImportLog)
    private importLogRepo: Repository<ImportLog>,
    @InjectRepository(Company)
    private companyRepo: Repository<Company>,
    private dataSource: DataSource,
  ) {}

  async runAll(date?: string): Promise<ReconciliationRunResult> {
    const runDate = date || new Date().toISOString().substring(0, 10);
    let results_created = 0;
    let flags_created = 0;
    const checks_run: string[] = [];

    this.logger.log(`Running reconciliation for date: ${runDate}`);

    const c1 = await this.check1_balanceReconciliation(runDate);
    results_created += c1.results;
    flags_created += c1.flags;
    checks_run.push('check1_balance');

    const c2 = await this.check2_accountStatusScan(runDate);
    flags_created += c2;
    checks_run.push('check2_status');

    // const c3 = await this.check3_negativeBalance(runDate);
    // flags_created += c3;
    // checks_run.push('check3_negative');

    const c4 = await this.check4_intergroupMatching(runDate);
    flags_created += c4;
    checks_run.push('check4_intergroup');

    const c5 = await this.check5_counterpartyBalance(runDate);
    flags_created += c5;
    checks_run.push('check5_counterparty');


    const c7 = await this.check7_currencyConversion(runDate);
    flags_created += c7;
    checks_run.push('check7_currency');

    const c9 = await this.check9_fileCompleteness(runDate);
    flags_created += c9;
    checks_run.push('check9_completeness');

    const c10 = await this.check10_staleAccounts(runDate);
    flags_created += c10;
    checks_run.push('check10_stale');

    const allFlags = await this.flagRepo.find({
      where: { date: runDate, resolved: false },
    });
    const discrepancies = await this.resultRepo.count({
      where: { date: runDate, status: 'discrepancy' },
    });

    return {
      results_created,
      flags_created,
      discrepancies,
      critical_flags: allFlags.filter((f) => f.severity === 'critical').length,
      warning_flags: allFlags.filter((f) => f.severity === 'warning').length,
      info_flags: allFlags.filter((f) => f.severity === 'info').length,
      checks_run,
    };
  }

  /**
   * Dedup helper: skip if identical flag already exists.
   * When bank_account_id is absent, dedup on date+flag_type+description only.
   */
  private async saveFlag(flag: Partial<ReconciliationFlag>): Promise<boolean> {
    const where: any = {
      date: flag.date,
      flag_type: flag.flag_type,
      description: flag.description,
    };
    if (flag.bank_account_id) {
      where.bank_account_id = flag.bank_account_id;
    }
    const existing = await this.flagRepo.findOne({ where });
    if (existing) return false;
    await this.flagRepo.save(this.flagRepo.create(flag));
    return true;
  }

  // ---------------------------------------------------------------------------
  // Check 1: opening + deposits - withdrawals = closing
  // ---------------------------------------------------------------------------
  private async check1_balanceReconciliation(
    date: string,
  ): Promise<{ results: number; flags: number }> {
    let results = 0;
    let flags = 0;

    const accountIds: Array<{ bank_account_id: number }> = await this.dataSource.query(
      `SELECT DISTINCT bank_account_id FROM account_transactions`,
    );

    for (const { bank_account_id } of accountIds) {
      const txs = await this.accountTxRepo.find({
        where: { bank_account_id },
        order: { date: 'ASC', id: 'ASC' },
      });
      if (txs.length === 0) continue;

      const firstTx = txs[0];
      const lastTx = txs[txs.length - 1];

      const openingBalance = parseFloat(
        (Number(firstTx.running_balance ?? 0) - Number(firstTx.deposit ?? 0) + Number(firstTx.withdrawal ?? 0)).toFixed(2),
      );

      const totalDeposits = parseFloat(txs.reduce((s, t) => s + Number(t.deposit ?? 0), 0).toFixed(2));
      const totalWithdrawals = parseFloat(txs.reduce((s, t) => s + Number(t.withdrawal ?? 0), 0).toFixed(2));
      const expectedClosing = parseFloat((openingBalance + totalDeposits - totalWithdrawals).toFixed(2));
      const actualClosing = parseFloat(Number(lastTx.running_balance ?? 0).toFixed(2));
      const difference = parseFloat(Math.abs(expectedClosing - actualClosing).toFixed(2));
      const status = difference <= 0.01 ? 'matched' : 'discrepancy';

      // Upsert reconciliation result
      const existing = await this.resultRepo.findOne({
        where: { bank_account_id, date: lastTx.date },
      });
      if (existing) {
        existing.expected_closing_balance = expectedClosing;
        existing.actual_closing_balance = actualClosing;
        existing.difference = parseFloat((expectedClosing - actualClosing).toFixed(2));
        existing.status = status;
        existing.notes = status === 'discrepancy' ? `Difference of ${difference.toFixed(2)}` : null;
        await this.resultRepo.save(existing);
      } else {
        await this.resultRepo.save(
          this.resultRepo.create({
            date: lastTx.date,
            bank_account_id,
            expected_closing_balance: expectedClosing,
            actual_closing_balance: actualClosing,
            difference: parseFloat((expectedClosing - actualClosing).toFixed(2)),
            status,
            notes: status === 'discrepancy' ? `Difference of ${difference.toFixed(2)}` : null,
          }),
        );
        results++;
      }

      if (status === 'matched') {
        await this.flagRepo.delete({ bank_account_id, flag_type: 'negative_balance' });
      }

      if (status === 'discrepancy') {
        const saved = await this.saveFlag({
          date: lastTx.date,
          flag_type: 'negative_balance',
          bank_account_id,
          description: `Balance discrepancy: expected ${expectedClosing.toFixed(2)}, recorded ${actualClosing.toFixed(2)}, diff ${(expectedClosing - actualClosing).toFixed(2)}`,
          severity: 'critical',
          resolved: false,
        });
        if (saved) flags++;
      }
    }
    return { results, flags };
  }

  // ---------------------------------------------------------------------------
  // Check 2: Account status scan — flag non-active accounts
  // ---------------------------------------------------------------------------
  private async check2_accountStatusScan(date: string): Promise<number> {
    let flags = 0;
    const problemAccounts = await this.bankAccountRepo
      .createQueryBuilder('ba')
      .where(`ba.status != 'active'`)
      .getMany();

    for (const acc of problemAccounts) {
      const saved = await this.saveFlag({
        date,
        flag_type: 'account_blocked',
        bank_account_id: acc.id,
        description: `Account status: ${acc.status}${acc.remarks ? ' — ' + acc.remarks : ''}`,
        severity: 'critical',
        resolved: false,
      });
      if (saved) flags++;
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // Check 3: Negative balance detection (latest running_balance per account)
  // ---------------------------------------------------------------------------
  private async check3_negativeBalance(date: string): Promise<number> {
    let flags = 0;
    const rows: Array<{
      bank_account_id: number;
      running_balance: string;
      date: string;
    }> = await this.dataSource.query(`
      SELECT DISTINCT ON (bank_account_id)
        bank_account_id,
        running_balance,
        date
      FROM account_transactions
      WHERE running_balance IS NOT NULL
      ORDER BY bank_account_id, date DESC, id DESC
    `);

    for (const row of rows) {
      if (Number(row.running_balance) < 0) {
        const saved = await this.saveFlag({
          date: row.date,
          flag_type: 'negative_balance',
          bank_account_id: row.bank_account_id,
          description: `Negative closing balance: ${Number(row.running_balance).toFixed(2)}`,
          severity: 'warning',
          resolved: false,
        });
        if (saved) flags++;
      }
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // Check 4: Intergroup transfer matching
  // ---------------------------------------------------------------------------
  private async check4_intergroupMatching(date: string): Promise<number> {
    let flags = 0;
    const intergroupTxs = await this.dailyTxRepo.find({
      where: { transaction_type: 'intergroup' },
    });

    for (const tx of intergroupTxs) {
      if (!tx.beneficiary) continue;

      const dateObj = new Date(tx.date);
      const dayBefore = new Date(dateObj);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(dateObj);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const beneficiaryUpper = tx.beneficiary.toUpperCase();

      const matchingCompanies = await this.companyRepo
        .createQueryBuilder('c')
        .where(`UPPER(c.name) LIKE :name`, { name: `%${beneficiaryUpper}%` })
        .getMany();

      if (matchingCompanies.length === 0) {
        const saved = await this.saveFlag({
          date: tx.date,
          flag_type: 'intergroup_mismatch',
          daily_transaction_id: tx.id,
          description: `No matching company found for intergroup beneficiary: ${tx.beneficiary}`,
          severity: 'warning',
          resolved: false,
        });
        if (saved) flags++;
        continue;
      }

      const companyIds = matchingCompanies.map((c) => c.id);
      const accounts = await this.bankAccountRepo
        .createQueryBuilder('ba')
        .where('ba.company_id IN (:...ids)', { ids: companyIds })
        .getMany();

      if (accounts.length === 0) {
        const saved = await this.saveFlag({
          date: tx.date,
          flag_type: 'intergroup_mismatch',
          daily_transaction_id: tx.id,
          description: `No bank accounts found for intergroup beneficiary: ${tx.beneficiary}`,
          severity: 'warning',
          resolved: false,
        });
        if (saved) flags++;
        continue;
      }

      const accountIds = accounts.map((a) => a.id);
      const amount = tx.amount_aed ?? tx.amount_usd ?? tx.amount_eur;

      const matchingCredit = await this.accountTxRepo
        .createQueryBuilder('at')
        .where('at.bank_account_id IN (:...ids)', { ids: accountIds })
        .andWhere('at.date BETWEEN :d1 AND :d2', {
          d1: dayBefore.toISOString().substring(0, 10),
          d2: dayAfter.toISOString().substring(0, 10),
        })
        .andWhere('at.deposit IS NOT NULL')
        .getOne();

      if (!matchingCredit) {
        const saved = await this.saveFlag({
          date: tx.date,
          flag_type: 'intergroup_mismatch',
          daily_transaction_id: tx.id,
          description: `No matching credit found for intergroup transfer to ${tx.beneficiary} on ${tx.date}${amount ? ' (amount: ' + amount + ')' : ''}`,
          severity: 'warning',
          resolved: false,
        });
        if (saved) flags++;
      }
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // Check 5: Counterparty balance validation
  // ---------------------------------------------------------------------------
  private async check5_counterpartyBalance(date: string): Promise<number> {
    let flags = 0;
    const rows = await this.counterpartyRepo.find();

    for (const row of rows) {
      const ob = Number(row.opening_balance_aed ?? 0);
      const inward = Number(row.inward_fund ?? 0);
      const outward = Number(row.outward_fund ?? 0);
      const commission = Number(row.commission_aed ?? 0);
      const cb = Number(row.closing_balance_aed ?? 0);
      // inward is stored as positive; outward is stored as negative (sign encodes direction).
      // Subtracting both gives the correct closing in all cases regardless of color.
      const expected = ob - inward - outward + commission;
      const diff = Math.abs(expected - cb);

      if (diff > 0.01) {
        const saved = await this.saveFlag({
          date: row.date,
          flag_type: 'intergroup_mismatch',
          description: `Counterparty ${row.counterparty_name} balance mismatch: expected ${expected.toFixed(2)}, actual ${cb.toFixed(2)}, diff ${(expected - cb).toFixed(2)}`,
          severity: 'critical',
          resolved: false,
        });
        if (saved) flags++;
      }
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // Check 6: Missing invoice numbers for inward/outward transactions
  // ---------------------------------------------------------------------------
  private async check6_missingInvoices(date: string): Promise<number> {
    let flags = 0;
    const txs = await this.dailyTxRepo
      .createQueryBuilder('dt')
      .where(`dt.transaction_type IN ('inward', 'outward')`)
      .andWhere(`(dt.invoice_number IS NULL OR dt.invoice_number = '')`)
      .getMany();

    for (const tx of txs) {
      const saved = await this.saveFlag({
        date: tx.date,
        flag_type: 'missing_invoice',
        daily_transaction_id: tx.id,
        description: `Missing invoice number for ${tx.transaction_type} transaction on ${tx.date}${tx.beneficiary ? ' — ' + tx.beneficiary : ''}`,
        severity: 'warning',
        resolved: false,
      });
      if (saved) flags++;
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // Check 7: Currency conversion matching (USD TO AED / AED TO USD)
  // ---------------------------------------------------------------------------
  private async check7_currencyConversion(date: string): Promise<number> {
    let flags = 0;
    const conversionTxs = await this.accountTxRepo
      .createQueryBuilder('at')
      .where(
        `UPPER(at.particular) LIKE '%USD TO AED%' OR UPPER(at.particular) LIKE '%AED TO USD%'`,
      )
      .getMany();

    for (const tx of conversionTxs) {
      const dateObj = new Date(tx.date);
      const dayBefore = new Date(dateObj);
      dayBefore.setDate(dayBefore.getDate() - 1);
      const dayAfter = new Date(dateObj);
      dayAfter.setDate(dayAfter.getDate() + 1);

      const account = await this.bankAccountRepo.findOne({
        where: { id: tx.bank_account_id },
      });
      if (!account) continue;

      const isUsdToAed = tx.particular?.toUpperCase().includes('USD TO AED');
      const targetCurrency = isUsdToAed ? 'AED' : 'USD';

      // A company may have multiple accounts in the target currency (e.g. ADIB AED,
      // ENBD AED, WIO AED). Search all of them — using findOne would arbitrarily pick
      // one and miss credits on the others.
      const targetAccounts = await this.bankAccountRepo.find({
        where: { company_id: account.company_id, currency: targetCurrency },
      });

      if (targetAccounts.length === 0) {
        const saved = await this.saveFlag({
          date: tx.date,
          flag_type: 'currency_conversion_missing',
          bank_account_id: tx.bank_account_id,
          description: `Currency conversion (${tx.particular}) has no corresponding ${targetCurrency} account for company_id ${account.company_id}`,
          severity: 'warning',
          resolved: false,
        });
        if (saved) flags++;
        continue;
      }

      const targetAccountIds = targetAccounts.map(a => a.id);
      const matchingCredit = await this.accountTxRepo
        .createQueryBuilder('at')
        .where('at.bank_account_id IN (:...ids)', { ids: targetAccountIds })
        .andWhere('at.date BETWEEN :d1 AND :d2', {
          d1: dayBefore.toISOString().substring(0, 10),
          d2: dayAfter.toISOString().substring(0, 10),
        })
        .andWhere('at.deposit IS NOT NULL')
        .getOne();

      if (!matchingCredit) {
        const saved = await this.saveFlag({
          date: tx.date,
          flag_type: 'currency_conversion_missing',
          bank_account_id: tx.bank_account_id,
          description: `Currency conversion ${tx.particular} on ${tx.date} — no matching ${targetCurrency} credit found`,
          severity: 'warning',
          resolved: false,
        });
        if (saved) flags++;
      }
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Check 9: Daily file completeness
  // ---------------------------------------------------------------------------
  private async check9_fileCompleteness(date: string): Promise<number> {
    let flags = 0;
    const requiredTypes = ['group_a', 'group_b', 'transactions', 'cashflow'];

    const latestLogs = await this.importLogRepo.find({
      order: { created_at: 'DESC' },
      take: 1,
    });
    const latestLog = latestLogs[0];
    if (!latestLog) return 0;

    const checkDate = latestLog.date;
    const logs = await this.importLogRepo.find({
      where: { date: checkDate, status: 'success' },
    });
    const importedTypes = logs.map((l) => l.file_type);
    const missing = requiredTypes.filter((t) => !importedTypes.includes(t));

    if (missing.length > 0) {
      const saved = await this.saveFlag({
        date: checkDate,
        flag_type: 'account_blocked',
        description: `Incomplete daily import — missing file types: ${missing.join(', ')}. Reconciliation may be inaccurate.`,
        severity: 'critical',
        resolved: false,
      });
      if (saved) flags++;
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // Check 10: Stale account detection (no tx >90 days, balance > 0)
  // ---------------------------------------------------------------------------
  private async check10_staleAccounts(date: string): Promise<number> {
    let flags = 0;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const cutoffStr = cutoff.toISOString().substring(0, 10);

    const stale: Array<{
      bank_account_id: number;
      last_date: string;
      running_balance: string;
    }> = await this.dataSource.query(`
      SELECT DISTINCT ON (bank_account_id)
        bank_account_id,
        date        AS last_date,
        running_balance
      FROM account_transactions
      ORDER BY bank_account_id, date DESC, id DESC
    `);

    for (const row of stale) {
      if (
        row.last_date <= cutoffStr &&
        Number(row.running_balance ?? 0) > 0
      ) {
        const saved = await this.saveFlag({
          date,
          flag_type: 'stale_account',
          bank_account_id: row.bank_account_id,
          description: `No transactions since ${row.last_date} but balance is ${Number(row.running_balance).toFixed(2)}`,
          severity: 'info',
          resolved: false,
        });
        if (saved) flags++;
      }
    }
    return flags;
  }

  // ---------------------------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------------------------

  async getResults(date?: string) {
    let sql = `
      SELECT
        rr.*,
        c.name        AS account_name,
        c.group       AS "group",
        ba.account_code,
        ba.bank_name,
        ba.currency
      FROM reconciliation_results rr
      LEFT JOIN bank_accounts ba ON ba.id = rr.bank_account_id
      LEFT JOIN companies     c  ON c.id  = ba.company_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (date) { sql += ` AND rr.date = $${params.length + 1}`; params.push(date); }
    sql += ` ORDER BY rr.date DESC, rr.id DESC LIMIT 500`;
    return this.dataSource.query(sql, params);
  }

  async deleteResult(id: number) {
    await this.resultRepo.delete(id);
    return { deleted: id };
  }

  async getFlags(date?: string, resolved?: boolean) {
    let sql = `
      SELECT
        rf.*,
        c.name        AS account_name,
        ba.account_code,
        ba.bank_name
      FROM reconciliation_flags rf
      LEFT JOIN bank_accounts ba ON ba.id = rf.bank_account_id
      LEFT JOIN companies     c  ON c.id  = ba.company_id
      WHERE 1=1
    `;
    const params: any[] = [];
    if (date) { sql += ` AND rf.date = $${params.length + 1}`; params.push(date); }
    if (resolved !== undefined) { sql += ` AND rf.resolved = $${params.length + 1}`; params.push(resolved); }
    sql += `
      ORDER BY
        CASE rf.severity WHEN 'critical' THEN 1 WHEN 'warning' THEN 2 ELSE 3 END,
        rf.created_at DESC
      LIMIT 1000
    `;
    return this.dataSource.query(sql, params);
  }

  async resolveFlag(id: number, notes?: string): Promise<ReconciliationFlag> {
    const flag = await this.flagRepo.findOneOrFail({ where: { id } });
    flag.resolved = true;
    if (notes)
      flag.description =
        (flag.description || '') + ' [RESOLVED: ' + notes + ']';
    return this.flagRepo.save(flag);
  }

  async getNetPosition(days = 30): Promise<{ date: string; aed: number; usd: number }[]> {
    const weekly = days >= 365;

    const sql = weekly
      ? `WITH week_series AS (
          SELECT generate_series(
            date_trunc('week', CURRENT_DATE - INTERVAL '364 days'),
            date_trunc('week', CURRENT_DATE),
            INTERVAL '1 week'
          )::date AS week_start
        ),
        account_weeks AS (
          SELECT
            ws.week_start,
            ba.id AS bank_account_id,
            ba.currency,
            (
              SELECT at.running_balance
              FROM account_transactions at
              WHERE at.bank_account_id = ba.id
                AND at.date <= ws.week_start + INTERVAL '6 days'
              ORDER BY at.date DESC, at.id DESC
              LIMIT 1
            ) AS closing_balance
          FROM week_series ws
          CROSS JOIN bank_accounts ba
        )
        SELECT
          week_start::text AS date,
          SUM(CASE WHEN currency = 'AED' AND closing_balance > 0 THEN closing_balance ELSE 0 END)::float AS aed,
          SUM(CASE WHEN currency = 'USD' AND closing_balance > 0 THEN closing_balance ELSE 0 END)::float AS usd
        FROM account_weeks
        GROUP BY week_start
        ORDER BY week_start ASC`
      : `WITH date_series AS (
          SELECT generate_series(
            CURRENT_DATE - ($1::int - 1) * INTERVAL '1 day',
            CURRENT_DATE,
            INTERVAL '1 day'
          )::date AS day
        ),
        account_days AS (
          SELECT
            ds.day,
            ba.id AS bank_account_id,
            ba.currency,
            (
              SELECT at.running_balance
              FROM account_transactions at
              WHERE at.bank_account_id = ba.id
                AND at.date <= ds.day
              ORDER BY at.date DESC, at.id DESC
              LIMIT 1
            ) AS closing_balance
          FROM date_series ds
          CROSS JOIN bank_accounts ba
        )
        SELECT
          day::text AS date,
          SUM(CASE WHEN currency = 'AED' AND closing_balance > 0 THEN closing_balance ELSE 0 END)::float AS aed,
          SUM(CASE WHEN currency = 'USD' AND closing_balance > 0 THEN closing_balance ELSE 0 END)::float AS usd
        FROM account_days
        GROUP BY day
        ORDER BY day ASC`;

    const rows = await this.dataSource.query(sql, weekly ? [] : [days]);
    return rows.map((r: any) => ({ date: r.date, aed: Number(r.aed), usd: Number(r.usd) }));
  }

  async getSummary(date?: string) {
    const runDate = date || new Date().toISOString().substring(0, 10);
    const [total_accounts, discrepancies, flags] = await Promise.all([
      this.bankAccountRepo.count(),
      this.resultRepo.count({ where: { date: runDate, status: 'discrepancy' } }),
      this.flagRepo.find({ where: { date: runDate, resolved: false } }),
    ]);
    return {
      date: runDate,
      total_accounts,
      discrepancies,
      critical_flags: flags.filter((f) => f.severity === 'critical').length,
      warning_flags: flags.filter((f) => f.severity === 'warning').length,
      info_flags: flags.filter((f) => f.severity === 'info').length,
      total_flags: flags.length,
    };
  }
}
