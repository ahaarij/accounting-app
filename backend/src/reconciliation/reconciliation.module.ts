import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ReconciliationService } from './reconciliation.service';
import { ReconciliationController } from './reconciliation.controller';
import { ReconciliationResult } from '../entities/reconciliation-result.entity';
import { ReconciliationFlag } from '../entities/reconciliation-flag.entity';
import { BankAccount } from '../entities/bank-account.entity';
import { AccountTransaction } from '../entities/account-transaction.entity';
import { DailyTransaction } from '../entities/daily-transaction.entity';
import { CounterpartyLedger } from '../entities/counterparty-ledger.entity';
import { ImportLog } from '../entities/import-log.entity';
import { Company } from '../entities/company.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ReconciliationResult,
      ReconciliationFlag,
      BankAccount,
      AccountTransaction,
      DailyTransaction,
      CounterpartyLedger,
      ImportLog,
      Company,
    ]),
  ],
  providers: [ReconciliationService],
  controllers: [ReconciliationController],
  exports: [ReconciliationService],
})
export class ReconciliationModule {}
