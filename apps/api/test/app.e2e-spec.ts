import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

/**
 * E2E tests require a reachable PostgreSQL and Redis instance.
 * Run via: pnpm --filter api run test:e2e (services via docker compose up -d).
 */
describe('Health (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('GET /api/health returns liveness', () => {
    return request(app.getHttpServer())
      .get('/api/health')
      .expect(200)
      .expect((res) => {
        expect(res.body.status).toBe('ok');
        expect(res.body.app).toBe('trading-bolt');
      });
  });

  it('GET /api/ready reports component statuses', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ready')
      .expect(200);
    expect(res.body.components).toBeDefined();
    expect(res.body.components.database).toBeDefined();
    expect(res.body.components.redis).toBeDefined();
  });
});
