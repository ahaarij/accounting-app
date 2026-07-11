import 'reflect-metadata';
import { config } from 'dotenv';
config();
import { DataSource } from 'typeorm';

if (!process.env.DB_PASSWORD) {
  throw new Error('DB_PASSWORD environment variable is not set — refusing to start');
}

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  username: process.env.DB_USER || 'reconciliation',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'reconciliation',
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  logging: false,
});
