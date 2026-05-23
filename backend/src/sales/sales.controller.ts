import { Controller, Post, Get, Query, UploadedFile, UseInterceptors, BadRequestException, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Post('import')
  @Roles('admin', 'accountant')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: (req, file, cb) => {
        const dir = path.join(process.cwd(), 'uploads');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
    }),
  }))
  async importSalesRegister(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.salesService.importSalesRegister(file.path, file.originalname);
  }

  @Get('customer-summary')
  async getCustomerSummary(
    @Query('company') company?: string,
    @Query('source') source?: string,
  ) {
    const src = source === 'csv' ? 'csv' : 'excel';
    return this.salesService.getCustomerSummary(company || undefined, src);
  }

  @Get('companies')
  async getCompanies() {
    return this.salesService.getImportedCompanies();
  }
}
