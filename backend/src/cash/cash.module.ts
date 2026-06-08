import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CashEntry } from '../entities/cash-entry.entity';
import { DailyCashflow } from '../entities/daily-cashflow.entity';
import { CashService } from './cash.service';
import { CashController } from './cash.controller';

@Module({
  imports: [TypeOrmModule.forFeature([CashEntry, DailyCashflow])],
  controllers: [CashController],
  providers: [CashService],
})
export class CashModule {}
