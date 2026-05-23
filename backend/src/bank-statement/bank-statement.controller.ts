import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UploadedFile, UseInterceptors, UseGuards, BadRequestException, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BankStatementService } from './bank-statement.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('bank-statements')
export class BankStatementController {
  constructor(private readonly svc: BankStatementService) {}

  // ── Account registry ─────────────────────────────────────────────────────────

  @Get('accounts')
  getAccounts() {
    return this.svc.getAccounts();
  }

  @Get('accounts-stats')
  getAccountsWithStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getAccountsWithStats(startDate, endDate);
  }

  @Post('accounts')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  createAccount(@Body() dto: { account_number: string; company_name: string; currency: string; bank_name: string }) {
    return this.svc.createAccount(dto);
  }

  @Patch('accounts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  updateAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<{ account_number: string; company_name: string; currency: string; bank_name: string }>,
  ) {
    return this.svc.updateAccount(id, dto);
  }

  @Delete('accounts/:id')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  deleteAccount(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteAccount(id);
  }

  // ── CSV import ────────────────────────────────────────────────────────────────

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('admin', 'accountant')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage() }))
  importCSV(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.importCSV(file.buffer, file.originalname);
  }

  // ── Company view ─────────────────────────────────────────────────────────

  @Get('company-names')
  getCsvCompanyNames() {
    return this.svc.getCsvCompanyNames();
  }

  @Get('company-transactions')
  getCsvCompanyTransactions(
    @Query('search') search: string,
    @Query('currency') currency?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: string,
  ) {
    return this.svc.getCsvCompanyTransactions(search ?? '', currency, startDate, endDate, page ? parseInt(page) : 1);
  }

  // ── Transactions ──────────────────────────────────────────────────────────────

  @Get('accounts/:id/transactions')
  getTransactions(
    @Param('id', ParseIntPipe) id: number,
    @Query('page') page?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getTransactions(id, page ? parseInt(page) : 1, 50, startDate, endDate);
  }
}
