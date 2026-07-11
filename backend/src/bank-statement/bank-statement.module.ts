import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankStatementController } from './bank-statement.controller';
import { BankStatementService } from './bank-statement.service';
import { CsvAccount } from '../entities/csv-account.entity';
import { CsvTransaction } from '../entities/csv-transaction.entity';
import { SuspenseRule } from '../entities/suspense-rule.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CsvAccount, CsvTransaction, SuspenseRule])],
  controllers: [BankStatementController],
  providers: [BankStatementService],
  exports: [BankStatementService],
})
export class BankStatementModule {}
