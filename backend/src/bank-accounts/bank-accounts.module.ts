import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankAccount } from '../entities/bank-account.entity';
import { AccountTransaction } from '../entities/account-transaction.entity';
import { DailyTransaction } from '../entities/daily-transaction.entity';
import { CounterpartyLedger } from '../entities/counterparty-ledger.entity';
import { BankAccountsService } from './bank-accounts.service';
import { BankAccountsController } from './bank-accounts.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankAccount, AccountTransaction, DailyTransaction, CounterpartyLedger]),
  ],
  providers: [BankAccountsService],
  controllers: [BankAccountsController],
})
export class BankAccountsModule {}
