import 'reflect-metadata';
import { config } from 'dotenv';
config(); // load .env for local dev (no-op in production where env vars are injected)
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set — refusing to start');
  }
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.enableCors({
    origin: [
      'https://accounting-app-frontend-mu.vercel.app',
      'https://recon-ae.vercel.app',
      'http://localhost:3001',
    ],
    credentials: true,
  });
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
  await app.listen(3000, '0.0.0.0');
  console.log('Backend running on port 3000');
}
bootstrap();
