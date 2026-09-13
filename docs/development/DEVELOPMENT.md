# Trading Bolt — local development

This document explains how to run the Trading Bolt development environment.

## Prerequisites

- Node.js >= 20
- pnpm >= 9 (`npm i -g pnpm`)
- One of:
  - **Docker Desktop / Rancher Desktop** for the full stack, or
  - a locally running **PostgreSQL 16+** and **Redis 7+** (fallback, see below)

## Install

```bash
pnpm install
```

## Setup

```bash
cp .env.example .env   # then edit .env with local values
```

`.env` is git-ignored and must never be committed. `.env.example` contains
placeholders only.

## Run (Docker recommended)

```bash
docker compose up --build
```

Starts: `web`, `api`, `worker`, `postgres`, `redis`.

## Run (no Docker — local Postgres/Redis fallback)

With PostgreSQL and Redis running locally:

```bash
pnpm dev          # web + api + worker in parallel
# or individually:
pnpm dev:web
pnpm dev:api
pnpm dev:worker
```

## Health checks

```text
GET /api/health   -> liveness  (process is up)
GET /api/ready    -> readiness (DB + Redis + queue connectivity)
```

## API (Phase 1 — Authentication)

```text
POST /api/auth/register   { email, password }  -> 201 { user, tokens }
POST /api/auth/login      { email, password }  -> 200 { user, tokens }
POST /api/auth/logout     { refreshToken }     -> 204  (requires Bearer access token)
GET  /api/auth/me         {}                   -> 200  (requires Bearer access token)
```

Notes:

- The API responds under the `/api` prefix (e.g. `http://localhost:4000/api/auth/...`).
- Access JWTs are signed with `JWT_SECRET`; refresh tokens are opaque and stored
  only as sha256 digests in the `sessions` table.
- Emails are lowercased/trimmed before storage. Passwords must be 8–72 chars.

## API (Phase 2 — Market Data)

```text
GET /api/markets/symbols                          -> ["BTCUSDT", "ETHUSDT", "SOLUSDT"]
GET /api/markets/:symbol/candles?interval&limit   -> Candle[]
GET /api/markets/:symbol/ticker                   -> Ticker | 404
```

Notes:

- Intervals: `1m`, `5m`, `15m`, `1h`, `4h`, `1d`. Default `limit` 100, max 200.
- Data source is the Bybit public spot REST API (`MARKET_DATA_BASE_URL`,
  defaults to `https://api.bybit.com`). No API key required for public data.
- Numeric price fields are carried as decimal strings start-to-finish (no float
  conversion), so precision is preserved; convert with the shared `toDecimal`
  helper for arithmetic.
- A provider interface (`MarketDataProvider`) sits in front of the exchange so
  later providers can be added without touching consumers.
- **Persistence**: The `/candles` endpoint uses a cache-aside pattern. When the
  most recent stored candle for `(symbol, interval)` is stale (older than 2× the
  candle interval) or absent, the provider is fetched and the results are
  idempotently upserted into the `market_candles` table before returning. Fresh
  DB data is served directly without hitting the provider.

## Packages (Phase 3 — signals & indicators, step A)

- `@trading-bolt/shared` adds the **Signal** domain: `SignalDirection`
  (`buy | sell | hold`) with `isSignalDirection` guard, optional bounded
  `strength` in `[0,1]`, and a deterministic `reason`. Signals are strategy
  opinions only; they never execute orders (AGENTS.md §9).
- `@trading-bolt/indicators` (was a stub) now provides deterministic,
  exact-decimal indicators:
  - `sma(values, period)` / `ema(values, period)` — aligned output with `null`
    during the warm-up window; EMA is seeded with the SMA of the first period.
  - `rsi(values, period)` — Wilder's RSI with documented boundary rules
    (avgLoss=0 → 100, avgGain=0 → 0, flat → 100).
  - `crossovers(a, b)` — aligned `bullish | bearish | null` events using exact
    decimal comparison; warm-up/null windows never emit signals.

All indicators are pure functions of their inputs (no randomness → signals are
reproducible), use `decimal.js` through the shared financial helpers, and leak no
future data.

## Packages (Phase 3 — strategies, step B)

- `@trading-bolt/trading-engine` (was a stub) now holds the strategy engine:
  - `Strategy` interface — `evaluate(candles): Signal`, a pure opinion that
    never executes orders. `StrategyFactory` pairs a unique `id`/`name`/
    `description` with a zod `configSchema` and a `create(config)` factory.
  - `StrategyRegistry` — `registerStrategy`, `listStrategies`,
    `isRegisteredStrategy`, `getStrategyFactory`,
    `createStrategy(id, config)` (zod-validated; typed `StrategyNotFoundError`
    / `InvalidStrategyConfigError` on failure). The package index registers
    the built-ins on import.
  - Built-in strategies:
    - `sma-crossover` — BUY on the exact bar a fast SMA crosses above a slow
      SMA, SELL on the reverse; config `{ fastPeriod, slowPeriod }`.
    - `rsi-mean-reversion` — BUY at/below `oversold`, SELL at/above
      `overbought`; config `{ period, oversold, overbought }`.
  - Signals are stamped with the latest candle's timestamp (never wall-clock
    time) so repeated evaluations are reproducible; insufficient data returns
    HOLD; empty input throws.
- Strategy config schemas are zod-validated; periods are positive integers and
  cross-field rules (slow > fast; oversold < 50 < overbought; oversold <
  overbought) are enforced server-side style at creation time.

## API (Phase 3 — strategies, step C)

- `apps/api/src/modules/strategies/` exposes the trading-engine registry
  read-only:
  - `GET /api/strategies` — lists registered strategies (`id`/`name`/
    `description`; config schemas are not exposed).
  - `POST /api/strategies/evaluate` — body `{ strategyId, symbol, interval,
limit?, config }`: candles are loaded through the existing `MarketsService`
    (cache-aside persistence applies), config is validated by the strategy's zod
    schema, and the strategy is evaluated; returns
    `{ candleCount, signal }`. Unknown strategy → 404, invalid config → 400.
  - Read-only by design: evaluation returns a `Signal` opinion and never creates
    orders (AGENTS.md §9). No DB tables yet (Strategy/StrategyVersion/Signal
    persistence is deferred to the Bot Engine phase).
- `StrategiesModule` imports `MarketsModule`; the global ValidationPipe enforces
  the `EvaluateStrategyDto` (supported symbol/interval, 1..200 candles, config
  must be an object).

## Backtesting (Phase 4, step A)

- `@trading-bolt/trading-engine` → `src/backtest/backtest.ts` exports
  `runBacktest(config): BacktestResult`. Deterministic, long-only, decimal
  finance (no floating point):
  - Strategy evaluated on `candles.slice(0, i + 1)` only — no look-ahead;
    candles must be strictly ascending.
  - BUY while flat: all-in at bar close + slippage − buy fee. SELL while long:
    close at bar close − slippage − sell fee. HOLD / repeat signals ignored.
    Open positions marked to market each bar; never force-liquidated.
  - `BacktestMetrics`: mark-to-market `endingBalance`/`netProfit`, `totalReturn`,
    `totalFeesPaid`, `closedTrades`, `winning/losingTrades`, `winRate`,
    `maxDrawdown`. Trades + equity curve expose full detail.
  - Invalid inputs throw `BacktestError` (no candles, non-ascending, bad
    balance/rates).
- 12 specs cover win/loss fixtures (hand-derived from SMA crossovers), zero-cost
  magnitudes, fee/slippage effects, open-position MTM, flat hold, re-run
  determinism, and `totalReturn` consistency.

### Config (Phase 4, step B)

- `BacktestConfig` now also accepts:
  - `positionSize` (default `"1"`, `0 < x <= 1`) — fraction of the current
    balance deployed per trade; `"0.5"` quarters the P&L accordingly.
  - `allowShort` (default `false`) — SELL-while-flat opens a short (negative
    position, margin-based sizing); the next BUY covers it. Without it SELLs
    while flat are ignored (strict long-only).
  - `riskFreeRate` (default `"0"`) — per-bar rate subtracted in Sharpe.
- New metrics: `profitFactor` (grossProfit/grossLoss; `null` when zero losses)
  and `sharpe` (bar-level over equity returns, sample std; `null` when < 2
  returns or std 0). Invalid metrics are `null`, never invented.
- Windows of `quantity` are negative for opening shorts; closing trades carry
  `realizedPnl` for both sides (long: net proceeds − cost basis; short: margin
  received − cover notional − cover fee).
- Backward compatible: defaults reproduce the step-A model exactly.

### Persistence (Phase 4, step C)

- `apps/api/src/modules/backtests/` persists completed runs (Postgres is the
  source of truth for financial records; AGENTS.md §13):
  - Entities: `backtests` (strategy, config jsonb, symbol/interval/limit, and
    every metric), `backtest_trades`, `backtest_equity_points` — both children
    `ON DELETE CASCADE` with `(backtest_id, seq)` indexes and `CASCADE` saves.
    Decimal fields are `numeric(40,20)` via a shared
    `decimalTransformer` (always strings in app code).
  - Migration `1700000000004-CreateBacktests.ts` registered in `data-source.ts`.
  - `BacktestRepository` abstract port + `TypeOrmBacktestRepository`;
    `BacktestsService.store()` maps a `BacktestResult` (trading-engine) through
    `backtest.mapper.ts` into entities (seq from array order) and persists via
    cascading children; `findById` loads trades/equity points ordered by seq; `list`.
  - `BacktestsModule` wired into `AppModule`.

### API + UI (Phase 4, step D)

- `BacktestsController` (registered in `BacktestsModule`, which now imports
  `MarketsModule`):
  - `POST /api/backtests` — run + persist a report (`BacktestsService.run`:
    candles → `createStrategy` → `runBacktest` → `store`); 404 unknown
    strategy, 400 invalid config / engine inputs.
  - `GET /api/backtests` — newest-first list; `GET /api/backtests/:id` —
    detail with ordered trades + equity points (`ParseUUIDPipe`, 404 if absent).
- `RunBacktestDto` = `EvaluateStrategyDto` shape + optional decimal-string
  execution parameters (`startingBalance` "10000", `feeRate` "0",
  `slippageRate` "0", `positionSize` "1", `allowShort` false,
  `riskFreeRate` "0"); ranges enforced by the engine (400).
- Web: `/backtests` (run form + saved-runs list) and `/backtests/[id]`
  (equity curve via new `EquityChart` LineSeries, metrics grid, config panel,
  trade table) using `lib/backtests.ts` typed client.

## Risk Engine (Phase 5)

- `@trading-bolt/risk-engine` implements the enforcement layer every order must
  pass through (AGENTS.md §10). Pure, deterministic, decimal-backed.
- `sizePosition` — position sizing from stop-loss distance:
  `allowedLoss = equity × riskFraction`; `quantity = allowedLoss / |entry − stop|`;
  stop must be on the correct side (long: < entry; short: > entry).
- `validateRiskConfig` — server-side policy parsing (fractions in `(0,1]`,
  integer position caps, session minutes `[0,1439]`, non-empty symbol/side
  lists, defaults applied). Throws `InvalidRiskConfigError` on malformed
  policy — fails closed, never approves with unsafe limits.
- `evaluateOrder` — the single risk gateway: proposal + account + config
  (+ injectable clock) → `RiskDecision { approved, results, reasons }`.
  14-rule deterministic matrix: symbol, side, session, stop-loss required,
  take-profit required, stop distance, take-profit distance, risk per trade,
  position size, exposure, open positions, daily loss, drawdown, breaker.
- `CircuitBreakerRegistry` — severities strategy/bot/account/global; OPEN only
  via explicit `trip(reason)`, closed only via explicit `reset()` (no automatic
  resumption, AGENTS.md §19). `evaluateBreaches` is the pure daily-loss /
  drawdown trip logic for the runtime layer.
- Wiring the evaluator + breakers into live account state and order submission
  is deferred to Phase 6+ — there is no server-side account ledger yet, and
  client-supplied account values would violate AGENTS.md §18.

## Scripts

```text
pnpm dev                 run web + api + worker
pnpm build               build all packages/apps
pnpm lint                lint all packages/apps
pnpm format / format:check
pnpm typecheck           typecheck all packages/apps
pnpm test                unit tests
pnpm test:e2e            e2e tests
pnpm db:migrate          run database migrations (api)
pnpm db:seed             seed database (api)
pnpm worker              run the worker alone
```

## Verification gate (run after changes)

```text
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Current unit-test counts (2026-09-13): shared 17, indicators 30, trading-engine 47, risk-engine 45, api 114.

E2E tests (`pnpm test:e2e`) and `db:migrate`/`db:seed` require a reachable
PostgreSQL + Redis (Docker Compose or CI).

## Directory overview

```text
apps/
  web/       Next.js frontend
  api/       NestJS backend
  worker/    BullMQ worker
packages/
  shared/    shared types, enums, financial utils
  (trading packages: indicators, trading-engine, risk-engine)
```
