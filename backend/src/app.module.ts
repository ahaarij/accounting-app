import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ImportModule } from './import/import.module';
import { ReconciliationModule } from './reconciliation/reconciliation.module';
import { AuthModule } from './auth/auth.module';
import { BankAccountsModule } from './bank-accounts/bank-accounts.module';
import { UsersModule } from './users/users.module';
import { BankStatementModule } from './bank-statement/bank-statement.module';
import { SalesModule } from './sales/sales.module';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      username: process.env.DB_USER || 'reconciliation',
      password: process.env.DB_PASSWORD || 'reconciliation123',
      database: process.env.DB_NAME || 'reconciliation',
      entities: [__dirname + '/**/*.entity{.ts,.js}'],
      migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
      migrationsRun: false,
      synchronize: false,
      logging: false,
    }),
    ImportModule,
    ReconciliationModule,
    AuthModule,
    BankAccountsModule,
    UsersModule,
    BankStatementModule,
    SalesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
