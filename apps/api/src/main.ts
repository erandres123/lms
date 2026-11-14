import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  const config = app.get(ConfigService);

  configureApp(app);

  app.setGlobalPrefix('v1');
  app.use(helmet());
  app.enableCors({
    origin: config.get<string[]>('CORS_ORIGINS', []),
    credentials: true,
  });
  app.enableShutdownHooks();

  const port = config.get<number>('PORT', 3001);
  await app.listen(port, '0.0.0.0');

  Logger.log(`API listening on port ${port}`, 'Bootstrap');
}

void bootstrap();
