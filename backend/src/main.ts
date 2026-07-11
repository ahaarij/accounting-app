import 'reflect-metadata';
import { config } from 'dotenv';
config(); // load .env for local dev (no-op in production where env vars are injected)
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { join } from 'path';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is not set — refusing to start');
  }
  if (process.env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET is too short — use at least 32 random characters (openssl rand -hex 64)');
  }
  if (!process.env.ENCRYPTION_KEY) {
    throw new Error('ENCRYPTION_KEY environment variable is not set — refusing to start (openssl rand -hex 32)');
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Real client IPs when running behind a reverse proxy (Caddy/nginx/Railway)
  app.set('trust proxy', 1);

  // Security headers. CORP must be cross-origin so the frontend (different origin)
  // can load images served from /uploads.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // Enforce class-validator DTO rules; strip unknown properties from decorated DTOs
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  const extraOrigins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: [
      'https://accounting-app-frontend-mu.vercel.app',
      'https://recon-ae.vercel.app',
      'http://localhost:3001',
      ...extraOrigins,
    ],
    credentials: true,
  });
  app.useStaticAssets(join(__dirname, '..', 'uploads'), { prefix: '/uploads' });
  await app.listen(3000, process.env.HOST || '0.0.0.0');
  console.log('Backend running on port 3000');
}
bootstrap();
