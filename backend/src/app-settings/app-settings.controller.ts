import { Controller, Get, Put, Body, UseGuards } from '@nestjs/common';
import { AppSettingsService } from './app-settings.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('app-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AppSettingsController {
  constructor(private readonly svc: AppSettingsService) {}

  @Get()
  @Roles('super_admin', 'admin', 'developer')
  getAll() {
    return this.svc.getAll();
  }

  @Put()
  @Roles('super_admin')
  saveMany(@Body() body: Record<string, string>) {
    return this.svc.setMany(body);
  }
}
