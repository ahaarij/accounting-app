import {
  Controller, Get, Post, Patch, Delete, Body, Param, ParseIntPipe,
  UseGuards, UseInterceptors, UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { CompaniesService } from './companies.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

const logoStorage = diskStorage({
  destination: join(__dirname, '..', '..', '..', 'uploads', 'logos'),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + extname(file.originalname));
  },
});

@UseGuards(JwtAuthGuard)
@Controller('company-profiles')
export class CompaniesController {
  constructor(private readonly svc: CompaniesService) {}

  // ── Company Profiles ─────────────────────────────────────────────────────────

  @Get()
  findAll() { return this.svc.findAll(); }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) { return this.svc.findOne(id); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  create(@Body() dto: {
    category?: string; company_name: string; owner_name?: string;
    address?: string; turnover_aed?: number;
    company_active_accounts?: string; personal_active_accounts?: string;
  }) { return this.svc.create(dto); }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.update(id, dto);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  remove(@Param('id', ParseIntPipe) id: number) { return this.svc.remove(id); }

  @Post(':id/logo')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  @UseInterceptors(FileInterceptor('logo', { storage: logoStorage }))
  uploadLogo(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.svc.updateLogo(id, `logos/${file.filename}`);
  }

  // ── Buyers / Suppliers ───────────────────────────────────────────────────────

  @Get('parties/all')
  findAllParties() { return this.svc.findAllParties(); }

  @Post('parties/create')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  createParty(@Body() dto: {
    name: string; type?: string; address?: string;
    contact_info?: string; linked_company_id?: number;
  }) { return this.svc.createParty(dto); }

  @Patch('parties/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  updateParty(@Param('id', ParseIntPipe) id: number, @Body() dto: any) {
    return this.svc.updateParty(id, dto);
  }

  @Delete('parties/:id')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  removeParty(@Param('id', ParseIntPipe) id: number) { return this.svc.removeParty(id); }

  // ── Links ─────────────────────────────────────────────────────────────────────

  @Post(':id/links')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  addLink(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: { party_id: number; relationship: string },
  ) { return this.svc.addLink(id, dto); }

  @Delete(':id/links/:linkId')
  @UseGuards(RolesGuard)
  @Roles('super_admin', 'admin', 'developer')
  removeLink(
    @Param('id', ParseIntPipe) id: number,
    @Param('linkId', ParseIntPipe) linkId: number,
  ) { return this.svc.removeLink(id, linkId); }
}
