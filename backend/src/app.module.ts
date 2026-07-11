import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { AuditModule } from './audit/audit.module';
import { ExcelBalanceModule } from './excel-balance/excel-balance.module';
import { AppSettingsModule } from './app-settings/app-settings.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      // Railway injects DATABASE_URL automatically; fall back to individual vars for local dev
      ...(process.env.DATABASE_URL
        ? {
            url: process.env.DATABASE_URL,
            // Set DB_SSL_STRICT=true when the DB presents a verifiable certificate
            ssl: { rejectUnauthorized: process.env.DB_SSL_STRICT === 'true' },
          }
        : {
            host: process.env.DB_HOST || 'localhost',
            port: parseInt(process.env.DB_PORT || '5432'),
            username: process.env.DB_USER || 'reconciliation',
            password: requireEnv('DB_PASSWORD'),
            database: process.env.DB_NAME || 'reconciliation',
          }),
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
      // Migrations are idempotent (TypeORM tracks applied ones); run on every boot
      // unless explicitly disabled, so a server with unset NODE_ENV never runs a stale schema
      migrationsRun: process.env.RUN_MIGRATIONS !== 'false',
      synchronize: false,
      logging: false,
    }),
    ScheduleModule.forRoot(),
    // Global rate limit: 300 requests/min per IP; auth endpoints have stricter
    // per-route overrides via @Throttle
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }]),
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
    AuditModule,
    ExcelBalanceModule,
    AppSettingsModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is not set — refusing to start`);
  }
  return value;
}
