import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, ParseIntPipe } from '@nestjs/common';
import { CashService } from './cash.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('cash')
export class CashController {
  constructor(private readonly svc: CashService) {}

  @Get('entries')
  getEntries(
    @Query('currency') currency?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getEntries(currency, startDate, endDate);
  }

  @Post('entries')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  createEntry(@Body() dto: {
    date: string; description?: string; cash_in?: number; cash_out?: number;
    balance?: number; notes?: string; currency?: string;
  }) {
    return this.svc.createEntry(dto);
  }

  @Patch('entries/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  updateEntry(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Partial<{
      date: string; description: string; cash_in: number; cash_out: number;
      balance: number; notes: string; currency: string;
    }>,
  ) {
    return this.svc.updateEntry(id, dto);
  }

  @Delete('entries/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  deleteEntry(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteEntry(id);
  }

  @Delete('cashflow/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  deleteCashflowRow(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteCashflowRow(id);
  }

  @Delete('cashflow')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  clearAllCashflow() {
    return this.svc.clearAllCashflow();
  }

  @Get('cashflow-summary')
  getCashflowSummary(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.svc.getCashflowSummary(startDate, endDate);
  }
}
