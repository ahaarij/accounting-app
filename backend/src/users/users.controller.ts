import { Controller, Get, Patch, Delete, Param, Body, UseGuards, ParseIntPipe, Request } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly svc: UsersService) {}

  @Get()
  @Roles('super_admin', 'admin')
  findAll() {
    return this.svc.findAll();
  }

  @Get('pending')
  @Roles('super_admin', 'admin')
  findPending() {
    return this.svc.findPending();
  }

  @Patch(':id/approve')
  @Roles('super_admin', 'admin')
  approve(@Param('id', ParseIntPipe) id: number) {
    return this.svc.approveUser(id);
  }

  @Patch(':id/reject')
  @Roles('super_admin', 'admin')
  reject(@Param('id', ParseIntPipe) id: number) {
    return this.svc.rejectUser(id);
  }

  @Patch(':id/role')
  @Roles('super_admin', 'admin')
  updateRole(
    @Param('id', ParseIntPipe) id: number,
    @Body('role') role: string,
    @Request() req: any,
  ) {
    return this.svc.updateRole(id, role as any, req.user.role);
  }

  @Delete(':id')
  @Roles('super_admin', 'admin')
  remove(@Param('id', ParseIntPipe) id: number, @Request() req: any) {
    return this.svc.remove(id, req.user.role);
  }
}
