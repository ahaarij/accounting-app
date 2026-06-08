import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ReconciliationService } from './reconciliation.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reconciliation')
export class ReconciliationController {
  constructor(
    private readonly reconciliationService: ReconciliationService,
  ) {}

  @Post('run')
  @Roles('super_admin', 'admin', 'developer')
  async run(@Body() body: { date?: string }) {
    return this.reconciliationService.runAll(body?.date);
  }

  @Get('net-position')
  async getNetPosition(@Query('days') days?: string) {
    return this.reconciliationService.getNetPosition(days ? parseInt(days) : 30);
  }

  @Get('summary')
  async getSummary(@Query('date') date?: string) {
    return this.reconciliationService.getSummary(date);
  }

  @Get('results')
  async getResults(@Query('date') date?: string) {
    return this.reconciliationService.getResults(date);
  }

  @Get('flags')
  async getFlags(
    @Query('date') date?: string,
    @Query('resolved') resolved?: string,
  ) {
    const resolvedBool =
      resolved === 'true' ? true : resolved === 'false' ? false : undefined;
    return this.reconciliationService.getFlags(date, resolvedBool);
  }

  @Delete('clear-all')
  @Roles('super_admin', 'admin', 'developer')
  async clearAll() {
    return this.reconciliationService.clearAll();
  }

  @Delete('results/:id')
  @Roles('super_admin', 'admin', 'developer')
  async deleteResult(@Param('id') id: string) {
    return this.reconciliationService.deleteResult(parseInt(id));
  }

  @Patch('flags/:id/resolve')
  @Roles('super_admin', 'admin', 'developer')
  async resolveFlag(
    @Param('id') id: string,
    @Body() body: { notes?: string },
  ) {
    return this.reconciliationService.resolveFlag(parseInt(id), body?.notes);
  }
}
