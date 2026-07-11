import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
  UploadedFile, UploadedFiles, UseInterceptors, UseGuards, BadRequestException, ParseIntPipe,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extensionFilter, MB } from '../common/upload.util';
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
  @Roles('super_admin', 'admin', 'developer')
  createAccount(@Body() dto: { account_number: string; company_name: string; currency: string; bank_name: string }) {
    return this.svc.createAccount(dto);
  }

  @Patch('accounts/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  updateAccount(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<{ account_number: string; company_name: string; currency: string; bank_name: string }>,
  ) {
    return this.svc.updateAccount(id, dto);
  }

  @Delete('accounts/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  deleteAccount(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteAccount(id);
  }

  // ── CSV import ────────────────────────────────────────────────────────────────

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * MB },
    fileFilter: extensionFilter(['.csv']),
  }))
  importCSV(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.importCSV(file.buffer, file.originalname);
  }

  // ── PDF import ────────────────────────────────────────────────────────────────

  @Post('import-pdf')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  @UseInterceptors(FilesInterceptor('files', 20, {
    storage: memoryStorage(),
    limits: { fileSize: 25 * MB },
    fileFilter: extensionFilter(['.pdf']),
  }))
  async importPDF(
    @UploadedFiles() files: Express.Multer.File[],
    @Body('password') password?: string,
  ) {
    if (!files?.length) throw new BadRequestException('No files uploaded');
    const results = [];
    for (const file of files) {
      const result = await this.svc.importPDF(
        file.buffer,
        file.originalname,
        undefined,
        password || undefined,
      );
      results.push(result);
    }
    return results;
  }

  // ── PDF preview (extract text only, no DB write) ─────────────────────────────

  @Post('preview-pdf')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 25 * MB },
    fileFilter: extensionFilter(['.pdf']),
  }))
  previewPDF(
    @UploadedFile() file: Express.Multer.File,
    @Body('password') password?: string,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.svc.previewPDF(file.buffer, password || undefined);
  }

  // ── PDF password ──────────────────────────────────────────────────────────────

  @Patch('accounts/:id/pdf-password')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  setPdfPassword(
    @Param('id', ParseIntPipe) id: number,
    @Body('password') password: string,
  ) {
    return this.svc.setPdfPassword(id, password ?? '');
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

  // ── Balance trend (chart) ─────────────────────────────────────────────────────

  @Get('balance-trend')
  getBalanceTrend(@Query('days') days?: string) {
    return this.svc.getBalanceTrend(days ? parseInt(days) : 30);
  }

  // ── Suspense review ───────────────────────────────────────────────────────────

  @Get('suspense')
  getSuspenseTransactions() {
    return this.svc.getSuspenseTransactions();
  }

  @Patch('transactions/:id/classify')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  classifyTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { transaction_type: string; label?: string; apply_to_similar?: boolean },
  ) {
    return this.svc.classifySuspense('statement', id, dto);
  }

  @Patch('excel-transactions/:id/classify')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  classifyExcelTransaction(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { transaction_type: string; label?: string; apply_to_similar?: boolean },
  ) {
    return this.svc.classifySuspense('excel', id, dto);
  }

  @Get('suspense-rules')
  getSuspenseRules() {
    return this.svc.getSuspenseRules();
  }

  @Delete('suspense-rules/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  deleteSuspenseRule(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteSuspenseRule(id);
  }

  // ── Nuke all transactions ─────────────────────────────────────────────────────

  @Delete('transactions/all')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin')
  deleteAllTransactions() {
    return this.svc.deleteAllTransactions();
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
