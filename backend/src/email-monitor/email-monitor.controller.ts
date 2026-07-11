import { Controller, Get, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { EmailMonitorService } from './email-monitor.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin')
@Controller('email-monitor')
export class EmailMonitorController {
  constructor(private readonly service: EmailMonitorService) {}

  @Get('config')
  getConfig() {
    // Sanitized: the stored app password is never returned to the browser
    return this.service.getSafeConfig();
  }

  @Post('config')
  saveConfig(
    @Body() body: {
      email: string;
      app_password: string;
      poll_interval_minutes?: number;
      is_active?: boolean;
      import_type?: 'group-a' | 'group-b' | 'transactions' | 'cashflow';
      sender_filter?: string;
    },
  ) {
    return this.service.saveConfig(body);
  }

  @Post('toggle')
  toggle() {
    return this.service.toggle();
  }

  @Post('test')
  testPoll() {
    // Run in background — don't await so the HTTP response returns immediately
    this.service.poll().catch(() => {});
    return { started: true };
  }

  @Get('status')
  getStatus() {
    return this.service.getStatus();
  }

  @Get('recent')
  getRecent() {
    return this.service.getRecentImports(10);
  }

  @Delete('recent')
  clearRecent() {
    return this.service.clearImportLog();
  }
}
