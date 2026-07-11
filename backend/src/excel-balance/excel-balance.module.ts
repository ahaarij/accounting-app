import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ExcelImport } from '../entities/excel-import.entity';
import { ExcelAccount } from '../entities/excel-account.entity';
import { ExcelTransaction } from '../entities/excel-transaction.entity';
import { SuspenseRule } from '../entities/suspense-rule.entity';
import { ExcelBalanceController } from './excel-balance.controller';
import { ExcelBalanceService } from './excel-balance.service';

@Module({
  imports: [TypeOrmModule.forFeature([ExcelImport, ExcelAccount, ExcelTransaction, SuspenseRule])],
  controllers: [ExcelBalanceController],
  providers: [ExcelBalanceService],
})
export class ExcelBalanceModule {}
