import { Controller, Post, Delete, UploadedFile, UseInterceptors, BadRequestException, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ImportService } from './import.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('super_admin', 'admin', 'developer')
@Controller('import')
export class ImportController {
  constructor(private readonly importService: ImportService) {}

  @Post('group-a')
  @UseInterceptors(FileInterceptor('file'))
  async importGroupA(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.importService.importGroupA(file.path, file.originalname);
  }

  @Post('group-b')
  @UseInterceptors(FileInterceptor('file'))
  async importGroupB(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.importService.importGroupB(file.path, file.originalname);
  }

  @Post('transactions')
  @UseInterceptors(FileInterceptor('file'))
  async importTransactions(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.importService.importTransactions(file.path, file.originalname);
  }

  @Post('cashflow')
  @UseInterceptors(FileInterceptor('file'))
  async importCashflow(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    return this.importService.importCashflow(file.path, file.originalname);
  }

  @Delete('reset')
  @Roles('super_admin', 'admin')
  async resetDatabase() {
    return this.importService.resetDatabase();
  }
}
