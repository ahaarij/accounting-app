import { Module } from '@nestjs/common';
import { AppSettingsModule } from '../app-settings/app-settings.module';
import { MailService } from './mail.service';

@Module({
  imports: [AppSettingsModule],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
