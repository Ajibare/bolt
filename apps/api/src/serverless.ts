import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { AppModule } from './app.module.js';
import { configureApp } from './app-setup.js';
import { JsonLogger } from './common/logger/json.logger.js';
import { loadEnvFile } from './config/env.load.js';
import { validateEnv } from './config/env.validation.js';

let ready: Promise<INestApplication> | undefined;

async function getApp(): Promise<INestApplication> {
  ready ??= (async () => {
    loadEnvFile();
    const config = validateEnv(process.env);
    const app = await NestFactory.create(AppModule, {
      logger: new JsonLogger('TradingBolt', config.LOG_LEVEL),
    });
    configureApp(app, config);
    await app.init();
    return app;
  })();
  return ready;
}

export default async function handler(
  req: Request,
  res: Response,
): Promise<void> {
  const app = await getApp();
  const httpAdapter = app.getHttpAdapter().getInstance();
  return httpAdapter(req, res);
}