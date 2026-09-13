import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { JsonLogger } from './common/logger/json.logger.js';
import { validateEnv } from './config/env.validation.js';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  const config = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger('TradingBolt', config.LOG_LEVEL),
  });

  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
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

  await app.listen(config.API_PORT, '0.0.0.0');
}

await bootstrap();
