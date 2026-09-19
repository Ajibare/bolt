import { NestFactory } from '@nestjs/core';
import { JsonLogger } from './common/logger/json.logger.js';
import { configureApp } from './app-setup.js';
import { loadEnvFile } from './config/env.load.js';
import { validateEnv } from './config/env.validation.js';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  const config = validateEnv(process.env);
  const app = await NestFactory.create(AppModule, {
    logger: new JsonLogger('TradingBolt', config.LOG_LEVEL),
  });

  configureApp(app, config);
  app.enableShutdownHooks();

  await app.listen(config.API_PORT, '0.0.0.0');
}

await bootstrap();
