import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SalesInvoice } from '../entities/sales-invoice.entity';
import { SalesService } from './sales.service';
import { SalesController } from './sales.controller';
import { SalesRegisterParser } from './parsers/sales-register.parser';

@Module({
  imports: [TypeOrmModule.forFeature([SalesInvoice])],
  controllers: [SalesController],
  providers: [SalesService, SalesRegisterParser],
  exports: [SalesService],
})
export class SalesModule {}
