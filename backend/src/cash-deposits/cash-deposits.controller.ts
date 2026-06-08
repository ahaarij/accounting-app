import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, ParseIntPipe, UseGuards,
} from '@nestjs/common';
import { CashDepositsService } from './cash-deposits.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard)
@Controller('cash-deposits')
export class CashDepositsController {
  constructor(private readonly svc: CashDepositsService) {}

  @Get()
  getDeposits(@Query('from') from: string, @Query('to') to: string) {
    return this.svc.getDeposits(from, to);
  }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  createDeposit(@Body() dto: {
    company_id: number; bank_account: string | null;
    date: string; description: string; amount: number; currency?: string;
  }) {
    return this.svc.createDeposit(dto);
  }

  @Patch('company-limits/:companyId')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  updateCompanyLimits(
    @Param('companyId', ParseIntPipe) companyId: number,
    @Body() dto: { bank_account: string; per_tx_limit?: number; monthly_limit?: number },
  ) {
    return this.svc.updateCompanyLimits(companyId, dto.bank_account, dto);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  updateDeposit(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { date?: string; description?: string; amount?: number },
  ) {
    return this.svc.updateDeposit(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  deleteDeposit(@Param('id', ParseIntPipe) id: number) {
    return this.svc.deleteDeposit(id);
  }
}
