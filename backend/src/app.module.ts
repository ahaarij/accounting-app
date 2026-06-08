import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ImportModule } from './import/import.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AuthModule } from './auth/auth.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { UsersModule } from './users/users.module';
import { BankStatementModule } from './bank-statement/bank-statement.module';
import { SalesModule } from './sales/sales.module';
import { EmailMonitorModule } from './email-monitor/email-monitor.module';
import { CashModule } from './cash/cash.module';
import { CompaniesModule } from './companies/companies.module';
import { CashDepositsModule } from './cash-deposits/cash-deposits.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      // Railway injects DATABASE_URL automatically; fall back to individual vars for local dev
      ...(process.env.DATABASE_URL
        ? {
            url: process.env.DATABASE_URL,
            ssl: { rejectUnauthorized: false },
          }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            username: process.env.DB_USER || 'reconciliation',
            password: process.env.DB_PASSWORD || 'reconciliation123',
            database: process.env.DB_NAME || 'reconciliation',
          }),
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
      migrationsRun: process.env.NODE_ENV === 'production',
      synchronize: false,
      logging: false,
    }),
    ScheduleModule.forRoot(),
    ImportModule,
    ReconciliationModule,
    AuthModule,
    BankAccountsModule,
    UsersModule,
    BankStatementModule,
    SalesModule,
    EmailMonitorModule,
    CashModule,
    CompaniesModule,
    CashDepositsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
