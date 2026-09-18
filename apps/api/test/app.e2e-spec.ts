import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { SUPPORTED_SYMBOLS } from '@trading-bolt/shared';
import type { Candle, OrderBook, Ticker } from '@trading-bolt/shared';
import { AppModule } from '../src/app.module.js';
import { intervalToMs } from '../src/modules/bots/bot-timing.js';
import { MarketDataProvider } from '../src/modules/markets/market-data.provider.js';

/**
 * E2E tests require a reachable PostgreSQL and Redis instance.
 * Run via: pnpm --filter api run test:e2e (services via docker compose up -d).
 */

/**
 * Suite-level isolation: stop any leftover RUNNING E2E bots from earlier failed
 * runs (direct SQL, so no application worker can race us) and clear the market
 * candle cache for the synthetic test symbol. Otherwise a stale bot's delayed
 * BullMQ tick can hit the real Bybit provider inside an app that did not stub
 * the market data provider, and keep its worker busy so `app.close()` stalls.
 */
beforeAll(async () => {
  const dataSource = new DataSource({
    type: 'postgres',
    url:
      process.env.DATABASE_URL ??
      'postgres://bolt:bolt_dev_password@localhost:5432/trading_bolt',
  });
  await dataSource.initialize();
  await dataSource.query(`
    UPDATE bots SET status = 'STOPPED'
    WHERE name LIKE '%E2E Bot%' AND status = 'RUNNING'
  `);
  await dataSource.query(`
    DELETE FROM market_candles
    WHERE symbol = 'SOLUSDT' AND interval = '1m'
  `);
  await dataSource.destroy();
}, 30_000);
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
    await request(app.getHttpServer()).get('/api/backtests').expect(401);
    await request(app.getHttpServer()).get('/api/backtests/bc123').expect(401);
    await request(app.getHttpServer())
      .post('/api/backtests')
      .send({})
      .expect(401);
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

describe('Bots (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;

  /**
   * Deterministic market data source for the whole bot cycle. The candle
   * series stays flat at 100 for the slow SMA to warm up, then jumps to 200 on
   * the FINAL bar — so fast SMA (5) crosses above slow SMA (20) exactly on the
   * latest candle and the strategy is guaranteed to emit BUY (SmaCrossover
   * reports the crossover state at the last bar, not the last event). The
   * ticker matches the last close and is used as the paper fill oracle.
   * Everything else (Postgres, Redis, BullMQ, the in-process worker, the risk
   * engine and the paper ledger) runs for real through the HTTP API.
   */
  const marketDataStub: MarketDataProvider = {
    name: 'e2e-stub',
    getSymbols: () => [...SUPPORTED_SYMBOLS],
    async getCandles(symbol, options) {
      const intervalMs = intervalToMs(options.interval);
      // slowPeriod=20 warm-up flat bars, then a jump on the last bar.
      const closes = [...Array(20).fill('100'), '200'];
      const count = closes.length;
      const now = Date.now();
      const candles: Candle[] = closes.map((close, i) => ({
        symbol,
        interval: options.interval,
        timestamp: now - (count - 1 - i) * intervalMs,
        open: close,
        high: close,
        low: close,
        close,
        volume: '1',
      }));
      return candles;
    },
    async getTicker(symbol) {
      const ticker: Ticker = {
        symbol,
        timestamp: Date.now(),
        lastPrice: '200',
        high: '200',
        low: '200',
        volume: '0',
      };
      return ticker;
    },
    async getRecentTrades() {
      return [];
    },
    async getOrderBook(symbol) {
      const book: OrderBook = {
        symbol,
        timestamp: Date.now(),
        bids: [],
        asks: [],
      };
      return book;
    },
  };

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MarketDataProvider)
      .useValue(marketDataStub)
      .compile();

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

    // Isolate the market-data cache for the bot's synthetic symbol and stop any
    // leftover RUNNING E2E bots from earlier failed runs so their delayed
    // BullMQ ticks cannot re-seed candles mid-test. The risk ledger, auth and
    // bots flows themselves are left untouched (asserted via the HTTP API).
    const dataSource = app.get(DataSource);
    await dataSource.query(`
      DELETE FROM market_candles
      WHERE symbol = 'SOLUSDT' AND interval = '1m'
    `);
    await dataSource.query(`
      UPDATE bots SET status = 'STOPPED'
      WHERE name = 'E2E Bot' AND status = 'RUNNING'
    `);

    const email = `bot-e2e-${Date.now()}@example.com`;
    const registerRes = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({ email, password: 'password123' })
      .expect(201);
    accessToken = registerRes.body.tokens.accessToken as string;
  });

  afterEach(async () => {
    await app.close();
  });

  async function waitForRunId(
    botId: string,
    minCycles: number,
  ): Promise<string> {
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      const res = await request(app.getHttpServer())
        .get(`/api/bots/${botId}/monitor`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const activeRun = res.body.activeRun;
      if (activeRun && activeRun.cyclesRun >= minCycles) {
        return activeRun.id as string;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    return '';
  }

  it('runs a bot to completion through the BullMQ worker and persists the cycle history', async () => {
    const http = app.getHttpServer();

    const account = await request(http)
      .post('/api/paper/accounts')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'E2E Bot Account' })
      .expect(201);

    const bot = await request(http)
      .post('/api/bots')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'E2E Bot',
        strategyId: 'sma-crossover',
        config: { kind: 'sma-crossover', fastPeriod: 5, slowPeriod: 20 },
        symbol: 'SOLUSDT',
        interval: '1m',
        paperAccountId: account.body.id,
        executionMode: 'PAPER',
        quantity: '1',
        stopLossPercent: '0.02',
      })
      .expect(201);
    expect(bot.body.status).toBe('DRAFT');

    await request(http)
      .post(`/api/bots/${bot.body.id}/start`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    const runId = await waitForRunId(bot.body.id as string, 1);
    expect(runId).not.toBe('');

    const cycles = await request(http)
      .get(`/api/bots/${bot.body.id}/runs/${runId}/cycles`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(cycles.body.length).toBeGreaterThanOrEqual(1);
    const first = cycles.body[0];
    expect(first.seq).toBe(1);
    expect(first.signalDirection).toBe('buy');
    expect(first.signalReason).toContain('crossed above');
    expect(first.orderStatus).toBe('FILLED');
    expect(first.orderSide).toBe('buy');
    expect(first.orderSymbol).toBe('SOLUSDT');
    expect(first.rejectionReason).toBeNull();
    expect(first.error).toBeNull();

    await request(http)
      .post(`/api/bots/${bot.body.id}/stop`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  }, 30_000);

  it('returns 404 for cycle history of a bot the user does not own', async () => {
    const http = app.getHttpServer();
    await request(http)
      .get(
        `/api/bots/${'00000000-0000-4000-8000-000000000000'}/runs/${'00000000-0000-4000-8000-000000000001'}/cycles`,
      )
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  }, 30_000);

  it('GET /api/brokers lists executors without exposing credentials', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/brokers')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    const paper = res.body.find(
      (entry: { provider: string }) => entry.provider === 'paper',
    );
    expect(paper).toMatchObject({ mode: 'PAPER', available: true });
    const binance = res.body.find(
      (entry: { provider: string }) => entry.provider === 'binance',
    );
    // E2E runs without BINANCE credentials, so the live broker must be refused.
    expect(binance).toMatchObject({ mode: 'LIVE', available: false });
    const bybit = res.body.find(
      (entry: { provider: string }) => entry.provider === 'bybit',
    );
    expect(bybit).toMatchObject({ mode: 'LIVE', available: false });
  });

  it('GET /api/brokers requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/brokers').expect(401);
  });

  it('GET /api/brokers/account returns a fail-closed monitor view', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/brokers/account')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    // E2E runs without broker credentials, so the monitor must fail closed
    // without exposing any credential-shaped data. The reported target is the
    // primary development exchange: Binance Testnet.
    expect(res.body.configured).toBe(false);
    expect(res.body.environment).toBe('testnet');
    expect(res.body.balances).toBeNull();
    expect(res.body.positions).toBeNull();
    expect(res.body.openOrders).toBeNull();
  });

  it('GET /api/brokers/account requires authentication', async () => {
    await request(app.getHttpServer()).get('/api/brokers/account').expect(401);
  });

  it('POST /api/brokers/orders/:id/cancel requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/brokers/orders/11111111-1111-4111-8111-111111111111/cancel')
      .expect(401);
  });

  it('POST /api/bots/:botId/emergency-stop requires authentication', async () => {
    await request(app.getHttpServer())
      .post('/api/bots/11111111-1111-4111-8111-111111111111/emergency-stop')
      .expect(401);
  });
});
