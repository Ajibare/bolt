import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
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

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('registers, logs in, reads /me and logs out', async () => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'password123';

    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);
    expect(registerRes.body.user.email).toBe(email);
    expect(registerRes.body.tokens.accessToken).toBeDefined();
    expect(registerRes.body.tokens.refreshToken).toBeDefined();

    const loginRes = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password })
      .expect(200);
    expect(loginRes.body.user.email).toBe(email);
    expect(loginRes.body.tokens.refreshToken).toBeDefined();

    await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${registerRes.body.tokens.accessToken}`)
      .expect(200)
      .expect((res) => {
        expect(res.body.email).toBe(email);
        expect(res.body.passwordHash).toBeUndefined();
      });

    await request(app.getHttpServer())
      .post('/api/auth/logout')
      .set('Authorization', `Bearer ${registerRes.body.tokens.accessToken}`)
      .send({ refreshToken: loginRes.body.tokens.refreshToken })
      .expect(204);
  });

  it('rejects duplicate registration', async () => {
    const email = `dup-${Date.now()}@example.com`;
    const password = 'password123';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(409);
  });

  it('rejects protected routes without a token', async () => {
    await request(app.getHttpServer()).get('/api/auth/me').expect(401);
  });

  it('rejects login with a wrong password', async () => {
    const email = `bad-${Date.now()}@example.com`;
    const password = 'password123';

    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password })
      .expect(201);

    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ email, password: 'wrong-password1' })
      .expect(401);
  });

  it('rejects invalid body payloads', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: 'short' })
      .expect(400);
  });
});
