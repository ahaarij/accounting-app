import { Controller, Get, Post, Delete, Param, Query, UploadedFile, UseInterceptors, UseGuards, BadRequestException, ParseIntPipe } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extensionFilter, MB } from '../common/upload.util';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ExcelBalanceService } from './excel-balance.service';

@UseGuards(JwtAuthGuard)
@Controller('excel-balance')
export class ExcelBalanceController {
  constructor(private readonly svc: ExcelBalanceService) {}

  @Post('import')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  @UseInterceptors(FileInterceptor('file', {
    storage: memoryStorage(),
    limits: { fileSize: 100 * MB },
    fileFilter: extensionFilter(['.xlsx', '.xls']),
  }))
  async importFile(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file provided');
    return this.svc.importFile(file.buffer, file.originalname);
  }

  @Get('imports')
  listImports() {
    return this.svc.listImports();
  }

  @Get('all-accounts')
  getAllAccounts() {
    return this.svc.getAllAccounts();
  }

  @Get('balance-trend')
  getBalanceTrend(@Query('days') days = '30') {
    return this.svc.getBalanceTrend(parseInt(days, 10) || 30);
  }

  @Get('imports/:id/accounts')
  getAccounts(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getAccounts(id);
  }

  @Get('accounts/stats')
  getAccountStats(@Query('from') from: string, @Query('to') to: string) {
    if (!from || !to) throw new BadRequestException('from and to are required');
    return this.svc.getAccountStats(from, to);
  }

  @Get('accounts/:id/transactions')
  getTransactions(@Param('id', ParseIntPipe) id: number) {
    return this.svc.getTransactions(id);
  }

  @Delete('imports/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  deleteImport(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteImport(id);
  }

  @Get('transactions/by-date')
  getTransactionsByDate(@Query('date') date: string) {
    if (!date) throw new BadRequestException('date is required');
    return this.svc.getTransactionsByDate(date);
  }

  @Get('suspense')
  getExcelSuspenseTransactions() {
    return this.svc.getExcelSuspenseTransactions();
  }

  @Delete('all')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  deleteAllData() {
    return this.svc.deleteAllData();
  }
}
