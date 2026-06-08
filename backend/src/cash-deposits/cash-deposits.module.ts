import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashDepositsController } from './cash-deposits.controller';
import { CashDepositsService } from './cash-deposits.service';
import { CompanyCashDeposit } from '../entities/company-cash-deposit.entity';
import { CompanyDepositLimit } from '../entities/company-deposit-limit.entity';
import { CompanyProfile } from '../entities/company-profile.entity';

@Module({
  imports: [TypeOrmModule.forFeature([CompanyCashDeposit, CompanyDepositLimit, CompanyProfile])],
  controllers: [CashDepositsController],
  providers: [CashDepositsService],
})
export class CashDepositsModule {}
