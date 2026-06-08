import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailConfig } from './email-config.entity';
import { ProcessedEmail } from './processed-email.entity';
import { EmailMonitorService } from './email-monitor.service';
import { EmailMonitorController } from './email-monitor.controller';
import { ImportModule } from '../import/import.module';
import { BankStatementModule } from '../bank-statement/bank-statement.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([EmailConfig, ProcessedEmail]),
    forwardRef(() => ImportModule),
    BankStatementModule,
  ],
  controllers: [EmailMonitorController],
  providers: [EmailMonitorService],
  exports: [EmailMonitorService],
})
export class EmailMonitorModule {}
