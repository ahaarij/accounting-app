import { Controller, Get, Param, Query, ParseIntPipe, UseGuards } from '@nestjs/common';
import { BankAccountsService } from './bank-accounts.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller()
export class BankAccountsController {
  constructor(private readonly svc: BankAccountsService) {}

  @Get('bank-accounts')
  findAll() {
    return this.svc.findAll();
  }

  // Static routes must come before /:id to avoid being swallowed by the param matcher
  @Get('bank-accounts/companies')
  getCompanyNames() {
    return this.svc.getCompanyNames();
  }

  @Get('bank-accounts/company-transactions')
  getCompanyTransactions(
    @Query('search') search: string,
    @Query('currency') currency?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
  ) {
    return this.svc.getCompanyTransactions(search ?? '', currency, startDate, endDate, page ? parseInt(page) : 1);
  }

  @Get('bank-accounts/:id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.svc.findOne(id);
  }

  @Get('bank-accounts/:id/transactions')
  findTransactions(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
  ) {
    return this.svc.findTransactions(id, page ? parseInt(page) : 1);
  }

  @Get('bank-accounts/:id/balance-walk')
  balanceWalk(
    @Param('id', ParseIntPipe) id: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.balanceWalk(id, startDate, endDate);
  }

  @Get('daily-transactions')
  getDailyTransactions(@Query('date') date?: string) {
    return this.svc.findDailyTransactions(date);
  }

  @Get('counterparty-ledger')
  getCounterpartyLedger(@Query('date') date?: string) {
    return this.svc.findCounterpartyLedger(date);
  }
}
