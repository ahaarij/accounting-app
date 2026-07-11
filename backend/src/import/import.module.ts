import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { MulterModule } from '@nestjs/platform-express';
import { ImportController } from './import.controller';
import { ImportService } from './import.service';
import { GroupAParser } from './parsers/group-a.parser';
import { GroupBParser } from './parsers/group-b.parser';
import { TransactionParser } from './parsers/transaction.parser';
import { CashflowParser } from './parsers/cashflow.parser';
import { Company } from '../entities/company.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { DailyBalance } from '../entities/daily-balance.entity';
import { AccountTransaction } from '../entities/account-transaction.entity';
import { DailyTransaction } from '../entities/daily-transaction.entity';
import { DailyCashflow } from '../entities/daily-cashflow.entity';
import { CounterpartyLedger } from '../entities/counterparty-ledger.entity';
import { ImportLog } from '../entities/import-log.entity';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { extensionFilter, MB } from '../common/upload.util';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Company,
      BankAccount,
      DailyBalance,
      AccountTransaction,
      DailyTransaction,
      DailyCashflow,
      CounterpartyLedger,
      ImportLog,
    ]),
    forwardRef(() => ReconciliationModule),
    MulterModule.register({
      storage: diskStorage({
        // tmp-imports is NOT served by the static /uploads route — imported
        // financial files must never be publicly reachable
        destination: (req, file, cb) => {
          const dir = path.join(process.cwd(), 'tmp-imports');
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          cb(null, dir);
        },
        // basename() strips any path segments smuggled into the client filename
        filename: (req, file, cb) =>
          cb(null, `${Date.now()}-${path.basename(file.originalname).replace(/[^\w.\- ]/g, '_')}`),
      }),
      limits: { fileSize: 200 * MB },
      fileFilter: extensionFilter(['.xlsx', '.xls']),
    }),
  ],
  controllers: [ImportController],
  providers: [ImportService, GroupAParser, GroupBParser, TransactionParser, CashflowParser],
  exports: [ImportService],
})
export class ImportModule {}
