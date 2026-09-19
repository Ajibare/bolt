import { ValidationPipe, type INestApplication } from '@nestjs/common';
import type { AppEnv } from './config/env.validation.js';

export function configureApp(app: INestApplication, config: AppEnv): void {
  app.setGlobalPrefix('api');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.enableCors({
    origin: config.WEB_ORIGIN.split(',').map((origin) => origin.trim()),
  });
}