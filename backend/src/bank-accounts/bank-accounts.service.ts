import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BankAccount } from '../entities/bank-account.entity';
import { AccountTransaction } from '../entities/account-transaction.entity';
import { DailyTransaction } from '../entities/daily-transaction.entity';
import { CounterpartyLedger } from '../entities/counterparty-ledger.entity';
import { escapeLike } from '../common/sql.util';

@Injectable()
export class BankAccountsService {
  constructor(
    @InjectRepository(BankAccount)
    private readonly accountRepo: Repository<BankAccount>,
    @InjectRepository(AccountTransaction)
    private readonly txRepo: Repository<AccountTransaction>,
    @InjectRepository(DailyTransaction)
    private readonly dailyTxRepo: Repository<DailyTransaction>,
    @InjectRepository(CounterpartyLedger)
    private readonly cpRepo: Repository<CounterpartyLedger>,
    private readonly dataSource: DataSource,
  ) {}

  findAll() {
    return this.dataSource.query(`
      SELECT
        ba.id,
        ba.account_code,
        ba.bank_name,
        ba.currency,
        ba.status,
        ba.remarks,
        c.name  AS account_name,
        c.group AS "group",
        COALESCE(
          CASE WHEN rr.status = 'matched' THEN rr.expected_closing_balance
               ELSE rr.actual_closing_balance
          END,
          lb.closing_balance,
          0
        ) AS closing_balance,
        COALESCE(lb.opening_balance, 0) AS opening_balance,
        COALESCE(rr.date, lb.date) AS balance_date,
        lt.last_transaction_date
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN LATERAL (
        SELECT expected_closing_balance, actual_closing_balance, status, date
        FROM reconciliation_results
        WHERE bank_account_id = ba.id
        ORDER BY date DESC
        LIMIT 1
      ) rr ON true
      LEFT JOIN LATERAL (
        SELECT closing_balance, opening_balance, date
        FROM daily_balances
        WHERE bank_account_id = ba.id
        ORDER BY date DESC
        LIMIT 1
      ) lb ON true
      LEFT JOIN LATERAL (
        SELECT MAX(date) AS last_transaction_date
        FROM account_transactions
        WHERE bank_account_id = ba.id
      ) lt ON true
      ORDER BY
        CASE WHEN COALESCE(rr.expected_closing_balance, lb.closing_balance, 0) = 0 THEN 1 ELSE 0 END,
        COALESCE(rr.expected_closing_balance, lb.closing_balance) DESC NULLS LAST
    `);
  }

  async findOne(id: number) {
    const rows = await this.dataSource.query(`
      SELECT
        ba.id,
        ba.account_code,
        ba.bank_name,
        ba.currency,
        ba.status,
        ba.remarks,
        c.name  AS account_name,
        c.group AS "group",
        COALESCE(lb.closing_balance, 0) AS closing_balance,
        COALESCE(lb.opening_balance, 0) AS opening_balance,
        COALESCE(agg.total_deposits,    0) AS total_deposits,
        COALESCE(agg.total_withdrawals, 0) AS total_withdrawals
      FROM bank_accounts ba
      JOIN companies c ON c.id = ba.company_id
      LEFT JOIN LATERAL (
        SELECT closing_balance, opening_balance
        FROM daily_balances
        WHERE bank_account_id = ba.id
        ORDER BY date DESC
        LIMIT 1
      ) lb ON true
      LEFT JOIN LATERAL (
        SELECT SUM(deposit) AS total_deposits, SUM(withdrawal) AS total_withdrawals
        FROM account_transactions
        WHERE bank_account_id = ba.id
      ) agg ON true
      WHERE ba.id = $1
    `, [id]);
    return rows[0] ?? null;
  }

  async findTransactions(id: number, page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await this.txRepo.findAndCount({
      where: { bank_account_id: id },
      order: { date: 'DESC', id: 'DESC' } as any,
      skip,
      take: limit,
    });
    return { data, total, page, totalPages: Math.ceil(total / limit) };
  }

  async balanceWalk(id: number, startDate?: string, endDate?: string) {
    return this.dataSource.query(`
      WITH range_txns AS (
        SELECT id, date, particular, deposit, withdrawal, running_balance,
          ROW_NUMBER() OVER (ORDER BY date ASC, id ASC) AS rn
        FROM account_transactions
        WHERE bank_account_id = $1
          AND ($2::date IS NULL OR date >= $2::date)
          AND ($3::date IS NULL OR date <= $3::date)
      ),
      ob AS (
        SELECT COALESCE(
          (
            SELECT running_balance
            FROM account_transactions
            WHERE bank_account_id = $1
              AND ($2::date IS NULL OR date < $2::date)
            ORDER BY date DESC, id DESC
            LIMIT 1
          ),
          (
            SELECT ROUND((COALESCE(running_balance,0) - COALESCE(deposit,0) + COALESCE(withdrawal,0))::numeric, 2)
            FROM range_txns WHERE rn = 1
          )
        ) AS val
      )
      SELECT
        o.id, o.date, o.particular, o.deposit, o.withdrawal, o.running_balance,
        ROUND(
          (SELECT val FROM ob) +
          SUM(COALESCE(o.deposit,0) - COALESCE(o.withdrawal,0))
            OVER (ORDER BY o.date ASC, o.id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW),
          2
        ) AS expected_balance
      FROM range_txns o
      ORDER BY o.date ASC, o.id ASC
    `, [id, startDate ?? null, endDate ?? null]);
  }

  async getCompanyNames(): Promise<string[]> {
    const rows = await this.dataSource.query(`SELECT name FROM companies ORDER BY name ASC`);
    return rows.map((r: any) => r.name);
  }

  async getCompanyTransactions(
    search: string,
    currency?: string,
    startDate?: string,
    endDate?: string,
    page = 1,
    limit = 200,
  ) {
    const pattern = `%${escapeLike(search)}%`;
    const params: any[] = [pattern, currency ?? null, startDate ?? null, endDate ?? null];

    const where = `
      FROM account_transactions at
      JOIN bank_accounts ba ON ba.id = at.bank_account_id
      JOIN companies c ON c.id = ba.company_id
      WHERE c.name ILIKE $1
        AND ($2::text IS NULL OR ba.currency = $2)
        AND ($3::date IS NULL OR at.date >= $3::date)
        AND ($4::date IS NULL OR at.date <= $4::date)
    `;

    const [rows, countRows] = await Promise.all([
      this.dataSource.query(`
        SELECT
          at.id, at.date, at.particular,
          COALESCE(at.deposit, 0)    AS deposit,
          COALESCE(at.withdrawal, 0) AS withdrawal,
          at.running_balance,
          c.name  AS account_name,
          ba.currency,
          ba.bank_name
        ${where}
        ORDER BY at.date ASC, at.id ASC
        LIMIT $5 OFFSET $6
      `, [...params, limit, (page - 1) * limit]),
      this.dataSource.query(`SELECT COUNT(*) AS total ${where}`, params),
    ]);

    const total = parseInt(countRows[0].total);
    return { data: rows, total, page, pages: Math.ceil(total / limit) };
  }

  findDailyTransactions(date?: string) {
    const qb = this.dailyTxRepo.createQueryBuilder('dt').orderBy('dt.date', 'DESC').addOrderBy('dt.id', 'DESC');
    if (date) qb.where('dt.date = :date', { date });
    return qb.getMany();
  }

  findCounterpartyLedger(date?: string) {
    const qb = this.cpRepo.createQueryBuilder('cp').orderBy('cp.date', 'DESC').addOrderBy('cp.counterparty_name', 'ASC');
    if (date) qb.where('cp.date = :date', { date });
    return qb.getMany();
  }
}
