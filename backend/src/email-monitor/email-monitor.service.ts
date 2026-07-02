import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailConfig } from './email-config.entity';
import { ProcessedEmail } from './processed-email.entity';
import { BankStatementService } from '../bank-statement/bank-statement.service';
import { ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import * as path from 'path';

@Injectable()
export class EmailMonitorService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmailMonitorService.name);
  private timer: NodeJS.Timeout | null = null;
  private lastChecked: Date | null = null;
  private nextCheck: Date | null = null;
  private isPolling = false;

  constructor(
    @InjectRepository(EmailConfig)
    private configRepo: Repository<EmailConfig>,
    @InjectRepository(ProcessedEmail)
    private processedRepo: Repository<ProcessedEmail>,
    private bankStatementService: BankStatementService,
  ) {}

  async onModuleInit() {
    const config = await this.getConfig();
    if (config?.is_active) {
      this.schedulePolling(config.poll_interval_minutes);
    }
  }

  onModuleDestroy() {
    this.stopPolling();
  }

  private schedulePolling(intervalMinutes: number) {
    this.stopPolling();
    const ms = intervalMinutes * 60 * 1000;
    this.nextCheck = new Date(Date.now() + ms);
    this.timer = setInterval(async () => {
      await this.poll();
    }, ms);
    this.logger.log(`Email polling scheduled every ${intervalMinutes} minutes`);
  }

  private stopPolling() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      this.nextCheck = null;
    }
  }

  async getConfig(): Promise<EmailConfig | null> {
    return this.configRepo.findOne({ where: { id: 1 } });
  }

  async saveConfig(dto: {
    email: string;
    app_password: string;
    poll_interval_minutes?: number;
    is_active?: boolean;
    sender_filter?: string;
  }): Promise<EmailConfig> {
    let config = await this.configRepo.findOne({ where: { id: 1 } });
    if (!config) {
      config = this.configRepo.create({ id: 1 });
    }
    Object.assign(config, dto);
    const saved = await this.configRepo.save(config);

    if (saved.is_active) {
      this.schedulePolling(saved.poll_interval_minutes);
    } else {
      this.stopPolling();
    }

    return saved;
  }

  async toggle(): Promise<{ is_active: boolean }> {
    const config = await this.getConfig();
    if (!config) throw new Error('No email config found. Save a config first.');

    config.is_active = !config.is_active;
    await this.configRepo.save(config);

    if (config.is_active) {
      this.schedulePolling(config.poll_interval_minutes);
    } else {
      this.stopPolling();
    }

    return { is_active: config.is_active };
  }

  async getStatus() {
    const config = await this.getConfig();
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const recentCount = await this.processedRepo
      .createQueryBuilder('pe')
      .where('pe.imported_at >= :since', { since: sevenDaysAgo })
      .andWhere('pe.error IS NULL')
      .getCount();

    return {
      isActive: config?.is_active ?? false,
      lastChecked: this.lastChecked,
      nextCheck: this.nextCheck,
      recentCount,
    };
  }

  async getRecentImports(limit = 10): Promise<ProcessedEmail[]> {
    return this.processedRepo.find({
      order: { imported_at: 'DESC' },
      take: limit,
    });
  }

  async clearImportLog(): Promise<{ deleted: number }> {
    // Delete only email-imported transaction rows (even in manually-created accounts)
    await this.processedRepo.query(`DELETE FROM csv_transactions WHERE source = 'email'`);
    // Delete email-created accounts that now have no transactions left
    await this.processedRepo.query(`
      DELETE FROM csv_accounts
      WHERE source = 'email'
      AND id NOT IN (SELECT DISTINCT csv_account_id FROM csv_transactions)
    `);
    const res = await this.processedRepo.query(`DELETE FROM processed_emails RETURNING id`);
    return { deleted: res.length ?? 0 };
  }

  async poll(): Promise<{ processed: number; errors: number }> {
    if (this.isPolling) return { processed: 0, errors: 0 };
    this.isPolling = true;

    const config = await this.getConfig();
    if (!config) {
      this.isPolling = false;
      return { processed: 0, errors: 0 };
    }

    this.lastChecked = new Date();
    const intervalMs = config.poll_interval_minutes * 60 * 1000;
    this.nextCheck = new Date(Date.now() + intervalMs);

    let processed = 0;
    let errors = 0;

    // Phase 1: open IMAP, fetch raw sources, mark SEEN, close — keep IMAP open as briefly as possible
    // so attachment parsing / DB writes (which can take many seconds) never idle the socket.
    type FetchedMsg = { uid: number; subject: string; source: Buffer };
    const fetched: FetchedMsg[] = [];

    const client = new ImapFlow({
      host: 'imap.gmail.com',
      port: 993,
      secure: true,
      auth: { user: config.email, pass: config.app_password },
      logger: false,
      connectionTimeout: 15000,
      greetingTimeout: 10000,
      socketTimeout: 90000,
    });

    try {
      await client.connect();
      const lock = await client.getMailboxLock('INBOX');

      try {
        const searchQuery: any = { seen: false };
        if (config.sender_filter) searchQuery.from = config.sender_filter;

        const uids: number[] = (await client.search(searchQuery, { uid: true })) || [];
        this.logger.log(`Found ${uids.length} unseen message(s) in INBOX`);

        for (const uid of uids) {
          const msg = await client.fetchOne(String(uid), { source: true, uid: true, envelope: true }, { uid: true });
          if (!msg) continue;
          fetched.push({ uid: msg.uid, subject: msg.envelope?.subject ?? '', source: msg.source });
          // Mark SEEN immediately — before any slow processing so socket stays active
          await client.messageFlagsAdd(String(msg.uid), ['\\Seen'], { uid: true });
        }
      } finally {
        lock.release();
      }

      await client.logout();
    } catch (err: any) {
      this.logger.error(`IMAP poll error: ${err?.message}`);
      this.isPolling = false;
      return { processed: 0, errors: 1 };
    }

    // Phase 2: parse and import — IMAP connection is already closed
    const failedUids = new Set<number>();

    for (const { uid, subject, source } of fetched) {
      const parsed = await simpleParser(source);
      const attachments = parsed.attachments ?? [];
      this.logger.log(`uid=${uid} subject="${subject}" — ${attachments.length} attachment(s)`);

      for (const attachment of attachments) {
        const filename = attachment.filename ?? 'attachment';
        const ext = path.extname(filename).toLowerCase();
        if (!['.csv', '.pdf'].includes(ext)) {
          this.logger.log(`  Skipping "${filename}" (unsupported type — only PDF and CSV accepted)`);
          continue;
        }

        const logKey = `${uid}-${filename}`;
        let recordsImported = 0;
        let importType = ext === '.pdf' ? 'pdf' : 'csv';
        let errorMsg: string | null = null;

        try {
          if (ext === '.csv') {
            this.logger.log(`  Importing "${filename}" → Bank Statements CSV…`);
            const result = await this.bankStatementService.importCSV(attachment.content, filename, 'email');
            recordsImported = result.imported;
            this.logger.log(`  Done — ${result.imported} imported, ${result.skipped} skipped`);
          } else {
            this.logger.log(`  Importing "${filename}" → Bank Statements PDF…`);
            const result = await this.bankStatementService.importPDF(attachment.content, filename, undefined, undefined, 'email');
            const totalImported = result.accounts.reduce((s, a) => s + a.imported, 0);
            const totalSkipped  = result.accounts.reduce((s, a) => s + a.skipped, 0);
            recordsImported = totalImported;
            importType = result.bank ?? 'pdf';
            this.logger.log(`  Done (${result.bank}) — ${totalImported} imported, ${totalSkipped} skipped (${result.pages} pages)`);
          }
          processed++;
        } catch (err: any) {
          errorMsg = err?.message ?? 'Unknown error';
          this.logger.error(`  Failed to import "${filename}": ${errorMsg}`);
          this.logger.log(`  Will mark uid=${uid} as unread — will retry in ${config.poll_interval_minutes} min`);
          errors++;
          failedUids.add(uid);
        }

        // Only log successful imports — failures are not recorded so the next poll retries them
        if (!errorMsg) {
          await this.processedRepo.query(
            `INSERT INTO processed_emails (message_id, filename, import_type, records_imported, error)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (message_id) DO NOTHING`,
            [logKey, filename, importType, recordsImported, null],
          );
        }
      }
    }

    // Mark failed emails back as unread so the next poll picks them up again
    if (failedUids.size > 0) {
      this.logger.log(`Marking ${failedUids.size} email(s) as unread for retry…`);
      const retryClient = new ImapFlow({
        host: 'imap.gmail.com',
        port: 993,
        secure: true,
        auth: { user: config.email, pass: config.app_password },
        logger: false,
        connectionTimeout: 15000,
        greetingTimeout: 10000,
        socketTimeout: 90000,
      });
      try {
        await retryClient.connect();
        const lock = await retryClient.getMailboxLock('INBOX');
        try {
          for (const uid of failedUids) {
            await retryClient.messageFlagsRemove(String(uid), ['\\Seen'], { uid: true });
            this.logger.log(`  uid=${uid} marked as unread`);
          }
        } finally {
          lock.release();
        }
        await retryClient.logout();
      } catch (err: any) {
        this.logger.error(`Failed to mark emails as unread for retry: ${err?.message}`);
      }
    }

    this.isPolling = false;
    return { processed, errors };
  }

}
