import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BankStatementController } from './bank-statement.controller';
import { BankStatementService } from './bank-statement.service';
import { CsvAccount } from '../entities/csv-account.entity';
import { CsvTransaction } from '../entities/csv-transaction.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CsvAccount, CsvTransaction])],
  controllers: [BankStatementController],
  providers: [BankStatementService],
})
export class BankStatementModule {}
