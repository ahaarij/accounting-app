import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('super_admin')
  getLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('entity_type') entity_type?: string,
  ) {
    return this.auditService.getLogs(
      page ? parseInt(page) : 1,
      limit ? parseInt(limit) : 100,
      entity_type,
    );
  }
}
