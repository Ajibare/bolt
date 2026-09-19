# Trading Bolt — Project Status

**Last updated:** 2026-09-19 (Phase 9 increment 7: per-bot trade analytics)
**Branch:** `main`
**Last commit:** `20ebcf3` — "feat: add per-bot trade analytics" (Phase 9)

---

## Current Phase

**Phase 8 — Binance Testnet (primary) / Bybit (fallback)** (IN PROGRESS — increments 1–11 done)

---

## Overall Status

| Phase | Name                       | Status                                         |
| ----- | -------------------------- | ---------------------------------------------- |
| 0     | Foundation                 | COMPLETE                                       |
| 1     | Authentication & Users     | COMPLETE (unit-verified; live-service pending) |
| 2     | Market Data                | COMPLETE (unit-verified; live-service pending) |
| 3     | Strategy Engine            | COMPLETE (unit-verified)                       |
| 4     | Backtesting Engine         | COMPLETE (unit-verified, steps A–D)            |
| 5     | Risk Engine                | COMPLETE (unit-verified)                       |
| 6     | Paper Trading              | COMPLETE (unit-verified, steps A–D)            |
| 7     | Bot Engine                 | COMPLETE (unit + E2E verified)                 |
| 8     | Binance Testnet (primary)  | IN PROGRESS                                    |
| 9     | Live Trading               | NOT STARTED                                    |
| 10    | Portfolio & Analytics      | IN PROGRESS (increment 7: per-bot trade analytics) |
| 11    | Notifications & Monitoring | NOT STARTED                                    |
| 12    | AI Features                | NOT STARTED                                    |
| 13    | Production Hardening       | NOT STARTED                                    |

---

## Completed Work

### Phase 0 — Foundation

- pnpm monorepo (apps/web, apps/api, apps/worker; packages/shared + 5 trading packages)
- NestJS API with `/api/health`, `/api/ready`, zod env validation, structured JSON logging
- Next.js web app (App Router, TanStack Query, Tailwind CSS, shadcn/ui-style utils)
- BullMQ worker consuming a smoke queue (graceful shutdown)
- TypeORM with PostgreSQL (autoLoadEntities, manual migrations via tsx)
- Redis module (ioredis) for health checks and BullMQ
- Docker Compose (postgres, redis, api, worker, web) with healthchecks
- Local fallback script (`scripts/dev.sh`)
- GitHub Actions CI workflow (`.github/workflows/ci.yml`)
- ESLint (eslint + oxlint), Prettier, TypeScript base configs
- `.env.example`, `.editorconfig`, `.gitignore`, `.dockerignore`, `.npmrc`
- Unit tests: shared (23), indicators (30), trading-engine (47), risk-engine (51), api (266), broker-adapters (95) = **512 total**

### Phase 1 — Authentication & Users

- `users` entity (email, password hash, role, timestamps) + migration `CreateUsers1`
- `sessions` entity (opaque refresh token as sha256 digest, revoked_at, expires_at) + migration `CreateSessions2`
- `AuthService`: register, login, logout, me; JWT access + refresh; bcryptjs hashing
- `JwtAuthGuard`, `CurrentUser` decorator, `Roles` + `RolesGuard`
- DTO validation (email normalization, 8–72 char password, whitelist pipe)
- Web: `/login`, `/register`, `/dashboard` pages; `AuthProvider`; localStorage token storage (MVP)

### Phase 2 — Market Data

- `MarketDataProvider` abstract class; `BybitMarketDataProvider` (public REST)
- Bybit KLine/Ticker/Trade/Orderbook mappers with timestamp dedup + validation
- `market_candles` entity + migration `CreateMarketCandles3`; cache-aside reads
- `GET /api/markets/symbols`, `GET /api/markets/:symbol/candles`, `GET /api/markets/:symbol/ticker`
- Error classification: `MarketDataError` with HTTP/rate-limit/provider codes
- Web: `/markets` page with TradingView Lightweight Charts candlestick chart

### Phase 3 — Strategy Engine

- `@trading-bolt/indicators` — SMA, EMA, RSI (Wilder), crossovers (decimal.js, deterministic, no look-ahead)
- `@trading-bolt/trading-engine` — `Strategy` interface, `StrategyFactory`, `StrategyRegistry`
- Built-in strategies: `sma-crossover`, `rsi-mean-reversion` (zod-validated config)
- `GET /api/strategies`, `POST /api/strategies/evaluate` (returns Signal, never orders)

### Phase 4 — Backtesting

- `runBacktest(config)` — deterministic, decimal-backed, long/short simulation
- Fees, slippage, position sizing, Sharpe, profit factor, max drawdown
- `backtests`/`backtest_trades`/`backtest_equity_points` entities + migration 4
- `POST /api/backtests` (run + persist), `GET /api/backtests`, `GET /api/backtests/:id`
- Web: `/backtests` (run form), `/backtests/[id]` (equity chart, metrics, trade table)

### Phase 5 — Risk Engine

- `@trading-bolt/risk-engine` — position sizing, 14-rule evaluation matrix, circuit breaker
- `evaluateOrder(proposal, account, config)` → APPROVED/REJECTED with reasons
- `CircuitBreakerRegistry` (strategy/bot/account/global severities, no auto-resume)
- `reduce-only` rule (exits validated, skip opening rules)
- `validateRiskConfig` (server-side policy parsing, fails closed)

### Phase 6 — Paper Trading

- `@trading-bolt/broker-adapters` — async `BrokerAdapter` interface
- `PaperBroker` — deterministic in-memory execution, idempotent per `clientOrderId`
- `paper_accounts`, `paper_orders`, `paper_positions`, `paper_portfolio_snapshots` + migration 5
- Risk-gated `POST /paper/accounts/:id/orders` (evaluateOrder → PaperBroker → persist)
- `GET /paper/accounts/:id/orders|positions|portfolio`; JWT-protected, ownership enforced

### Phase 7 — Bot Engine (COMPLETE — see "Phase 7 Details")

- Bot lifecycle state machine (DRAFT→STARTING→RUNNING→PAUSED→STOPPING→STOPPED/ERROR)
- Bot execution cycle: settle limits → fetch candles → evaluate strategy → build intent → risk-gated order
- BullMQ `bot-execution` queue; `BotExecutionProcessor` + `BotRunnerService`
- Bot CRUD + lifecycle API (start/pause/resume/stop/recover/monitor/runs)
- `bots`/`bot_runs` entities + migration 6
- `settleLimitOrders` in PaperTradingService (resting limit fill from market tick)
- Bot types in `@trading-bolt/shared` (BotStatus, BotExecutionMode, BotTickJob)
- Per-cycle signal/order persistence: `bot_run_cycles` entity + migration 7
  (`CreateBotRunCycles1700000000007`), port `BotRunCycleRepository` +
  `TypeOrmBotRunCycleRepository`, runner writes one record per tick (signal,
  order, rejection reason or error) for both success and error paths
- `GET /api/bots/:botId/runs/:runId/cycles` (JWT + ownership 404-guarded)
- Web: cycle-history list in the `/bots` monitor panel (refetch 5s)
- Bot-cycle E2E test through the real BullMQ worker + stub market data provider
  (9 E2E tests total)
- Unit tests: bot-lifecycle (7), bot-cycle (9 after TP-undefined fix), bot-timing (3),
  runner (15 incl. 4 new persistence tests) = 34 bot tests

### Phase 8 — Live Trading (IN PROGRESS)

- Increment 8: bot creation execution-mode selector (AGENTS.md §11)
  - The `/bots` create form now offers PAPER / DEMO / TESTNET / LIVE buttons backed by
    `GET /api/brokers` (advisory): live modes are disabled until a Bybit credential pair is
    configured AND the mode matches `BYBIT_ENVIRONMENT` (`DEMO→demo`, `TESTNET→testnet`,
    `LIVE→mainnet`), mirroring the server-side gate in `BotsService.assertExecutionModeAllowed`
    (which stays authoritative — the UI only surfaces the same rule). The selected mode is sent in
    the existing `CreateBotInput.executionMode`
  - Live-capable bots show a colored mode badge (PAPER zinc / DEMO emerald / TESTNET sky / LIVE red)
    next to the status badge in the bot list; the unavailability hint + submit guard prevent a
    client-side path that the server would reject anyway
  - Web: `lib/brokers.ts` adds `BrokerExecutorInfo` + `listBrokers()`; no server changes
- Increment 11: Binance testnet smoke-test tooling (AGENTS.md §8/§45)
  - `apps/api/scripts/smoke-binance.ts` (`pnpm --filter api smoke:binance`) — a
    standalone driver that proves the whole signed live path against testnet
    with one small trade: balance check → price discovery → market buy entry →
    wait-for-fill → OCO protective bracket → fee reconciliation (myTrades
    sweep) → cancel bracket legs → flatten. Fail-closed: refuses mainnet
    unless `SMOKE_ALLOW_MAINNET=1`, aborts on insufficient quote balance, and
    if cleanup fails it exits non-zero AND warns not to re-run blindly (each
    run has a fresh idempotency key, so a retry is a NEW trade — AGENTS §16).
    `--dry-run` verifies connectivity/credentials without trading; `--leave`
    keeps the position + bracket for inspection. Adapter-level by design: it
    drives `BrokerAdapter` exactly like `LiveTradingService` does, no database
    needed. Lint/format/typecheck hooks extended to `scripts/`
- Increment 10: Binance fill-fee accounting (AGENTS.md §14/§17)
  - `BinanceAdapter.getOrder` now sweeps `/api/v3/myTrades` for any order with
    a non-zero fill and reports cumulative `fees`; `GET /order` carries no
    commission data, so myTrades is the authoritative source. Only commissions
    settled in the pair's quote asset are counted (`deriveQuoteAsset`,
    longest-suffix match: BNBUSDT→USDT, ETHBTC→BTC); BNB-discount / base-asset
    fees are deliberately not converted into quote terms (never guess a price,
    AGENTS.md §14/§27). A failed sweep leaves the provisional "0" — fees never
    block reconciliation
  - Reconciliation now settles `paper_orders.fees` from the broker whenever
    the remote view is faithful (not only on status transitions). Previously a
    market entry fills at creation and its FILLED row was never re-swept, so
    real fees would never land; `listPendingLive` now also returns any FILLED
    order that has never been reconciled (first sweep settles fees, then it
    drops out). Divergent views (identity mismatch, local terminal vs broker
    open) never touch local fees
  - Unit tests: binance adapter +7 (myTrades sweep, quote-asset exclusion,
    skip-when-unfilled, sweep-failure), mappers +9 (quote/fee-sum rules),
    reconciliation +2 (terminal fee settlement, fee preservation under
    divergence), repository +2 (OR branches, account scoping). api **275**,
    broker-adapters **115** (541 total)
- Increment 9: Binance OCO protective brackets (AGENTS.md §14/§16/§19)
  - `BrokerAdapter` gains the optional `attachProtectiveBracket(input)` contract
    (`ProtectiveBracketInput` = filled `entryOrderId`, `symbol`, `quantity`,
    `stopLoss`, `takeProfit`, deterministic `idempotencyKey`); Bybit/Paper keep
    the base contract (they bracket at entry time)
  - `BinanceAdapter.attachProtectiveBracket` submits a SELL **limit OCO**
    (`POST /api/v3/order/oco`): a take-profit SELL leg at `price` plus a
    stop-limit SELL leg (`stopPrice`+`stopLimitPrice`, GTC) that auto-cancels
    its sibling when either fills — the SL/TP protection bots request. Prices
    are rounded to the tick, quantity floored to the lot (fail-validated);
    brackets require both legs and `stopLoss < takeProfit` (invalid geometry
    refused). `listClientOrderId` is the idempotency key
  - The create-order path no longer rejects SL/TP intent on a **market buy**
    entry (the legs are entry metadata); SL/TP on sell closes and on resting
    limit entries is still refused fail-closed (spot brackets only exist after
    a fill)
  - `LiveTradingService.placeOrder`: after a **FILLED** Binance buy entry it
    attaches the bracket synchronously and persists the broker `orderListId`
    on `paper_orders.bracket_order_list_id` (migration 10). If the bracket
    fails, the just-opened position is closed with a reduce-only market sell
    (fail-closed reversal, `ENTRY_REVERSED`) and the entry is recorded
    truthfully for reconciliation — no unprotected position is silently left
  - Unit tests: binance adapter +9 (bracket submission, tick/lot
    normalization, geometry + idempotency validation), live-trading +5
    (bracket attach, bybit untouched, deterministic key, bracket-failure
    reversal, deferral on unfilled entry). api **271**, broker-adapters **104**
    (524 total)
- Increment 8: Binance Testnet becomes the primary live broker (AGENTS.md §11/§12/§14)
  - New `@trading-bolt/broker-adapters/src/binance/` module: `BinanceAdapter` (async
    `BrokerAdapter`) + HMAC-SHA256 `BinanceHttpClient` (sorted+URL-encoded query, injectable
    `fetch`/`now` for deterministic tests), `mappers.ts` (REST→`BrokerOrder`/account/positions,
    precision-step helpers `floorToStep`/`roundToStep` mirroring Bybit) and a 14-test spec
  - Env validation hardens `BINANCE_*`: `BINANCE_ENV` enum (default `testnet`); mainnet refused
    unless `NODE_ENV=production` (fail-closed); a partial `BINANCE_API_KEY`/`BINANCE_API_SECRET`
    pair is refused. Testnet base URL `https://testnet.binance.vision`, mainnet `https://api.binance.com`
  - `BrokersService` becomes an **active-provider router**: `provider()` = `'binance'` when a
    Binance credential pair is configured, else `'bybit'`, else `null`; `getLiveAdapter()`/`environment()`
    replace the Bybit-only `getBybitAdapter()`. Live order paths in `LiveTradingService`, the
    order-reconciliation service, position reconciliation, and emergency flatten all route through
    the active adapter and pass `{ symbol }` to `getOrder`/`cancelOrder` (Binance spot orders are
    keyed by symbol). Paper-trading repo queries generalize to `provider IN (binance, bybit)`
  - Interface: `BrokerOrderIdentity { symbol? }` added to the `BrokerAdapter` contract;
    `BinanceApiError` carries the REST `code` (e.g. `-2013` → `getOrder` returns `null`). Status
    mapping `NEW→ACCEPTED`, `CANCELED/EXPIRED/PENDING_CANCEL→CANCELLED`, `REJECTED→REJECTED`
  - Binance spot semantics documented at the adapter: no cost basis (`avgEntryPrice "0"`), no
    shorts, `reduceOnly` not sent, and `stopLoss`/`takeProfit` rejected fail-closed (OCO support is
    a follow-up); bots with SL/TP set hard-error on Binance rather than trading unsafely
  - Web: `BrokerExecutorInfo.provider` now `"paper" | "binance" | "bybit"`; the `/bots` page prefers
    the Binance executor for the live-broker badge/guard, falling back to Bybit. e2e broker
    assertions updated (unconfigured `environment` now `'testnet'`; binance executor listed)
  - Unit tests: env.validation +8, brokers.service reworked, live-trading spec now covers the
    Binance provider, reconciliation specs pass symbol — api package now **266 unit tests**;
    broker-adapters now **95 tests** (512 total)
- Increment 7: frontend live broker monitor + order controls (AGENTS.md §22)
  - New `/live-broker` page (JWT-gated): polls `GET /api/brokers/account` every 5s and renders
    environment badge, overview gems (equity/free/open counts), circuit breakers, balances,
    positions and open orders. Fail-closed empty state when no broker is configured; per-surface
    broker failures render as amber warnings instead of blanking the page
  - **Cancel open orders** from the UI: the account view now attaches the local `paper_orders` id
    to each broker open order (`LiveOrderView.localId`, enriched in `getAccountView` via
    `PaperOrderRepository.findLiveByBrokerOrderIds`); orders that predate/are external to Trading
    Bolt show "external" and cannot be cancelled here. Cancel calls the ownership-checked
    `POST /api/brokers/orders/:orderId/cancel` (server-side auth stays authoritative)
  - **Emergency stop** wired into the `/bots` list: a red "Emergency stop" button appears on
    live-capable bots (executionMode ≠ PAPER) in RUNNING/PAUSED/STARTING/STOPPING, with a confirm
    dialog before `POST /api/bots/:botId/emergency-stop`
  - Navigation: "Live broker monitor" link in the `/bots` header + a "Live broker" button on the
    dashboard; `lib/brokers.ts` typed client (`getAccountView`, `cancelLiveOrder`),
    `lib/bots.ts` adds `emergencyStopBot`
  - Unit test added: getAccountView local-id enrichment (1) — api package now **252 unit tests**
    (476 total); e2e stays 15; web build passes with the new route
- Increment 6: live account monitor + position reconciliation (AGENTS.md §17/§22)
  - **Monitor surface**: `GET /api/brokers/account` → `LiveAccountController` → `LiveTradingService
.getAccountView()`; JWT-guarded, read-only. Returns `configured/environment`, wallet `balances` +
    summed `equity`/`freeBalance`, broker `positions` + `openOrders`, and open circuit breakers —
    never credentials. Fails closed to `configured:false` without an adapter; per-surface adapter
    failures degrade to `warnings` instead of failing the whole request (a broker hiccup does not
    blank the account)
  - **Position reconciliation**: `PositionReconciliationService` computes the net position implied by
    the local live order ledger (signed fill identity `Σ signed(qty)` — every buy +, every sell −,
    openings and reduce-only closes alike) across every account with live orders
    (`PaperOrderRepository.listLiveAccounts`), compares against `adapter.getPositions()` (all
    symbols), and logs `POSITION_DIVERGENCE` for any symbol whose local net differs from the broker
  - Read-only by design: never mutates the ledger and never auto-trades a fix; a position that
    predates Trading Bolt (broker holds it, ledger never touched it) is a legit divergence and is
    flagged, not silently adopted. Unreachable broker → account skipped + logged
  - Wired into `ReconciliationProcessor`: every `order-reconciliation` job now also runs the position
    pass and returns a `ReconciliationRunOutcome` (order outcome + `positions` sub-outcome)
  - Unit tests added: position-reconciliation.service (10), live-trading getAccountView (4) — api
    package now **251 unit tests** (475 total); e2e now 15 tests (+account monitor 200/401)
- Increment 5: live order management + emergency controls (AGENTS.md §16/§17/§19)
  - **Persistent circuit breakers**: migration 9 (`circuit_breakers`) + `CircuitBreakerEntity`,
    abstract `CircuitBreakerRepository` + TypeORM impl, wired through `CircuitBreakerService`
    (`assertTradingAllowed` is now async and persists account/bot trips; `reset` deletes the row;
    `onApplicationBootstrap` hydrates the registry so a restart never auto-closes an OPEN breaker)
  - **Live order cancellation**: `POST /api/brokers/orders/:orderId/cancel` → `LiveOrdersController`
    → `LiveTradingService.cancelOrder(userId, orderId)` (server-side ownership via
    `PaperAccountRepository`, only `provider='bybit'` orders, idempotent on already-cancelled,
    refuses FILLED/REJECTED/FAILED, never fabricates the CANCELLED status — reconciliation confirms
    the broker state), then enqueues reconciliation
  - **Emergency stop**: `POST /api/bots/:botId/emergency-stop` → `BotsService.emergencyStop` →
    `LiveTradingService.emergencyFlatten`: cancels open live orders on the symbol and flattens the
    broker-held position with reduce-only market orders (which pass open breakers by design in case
    the breaker itself needs de-risking). The bot always transitions to STOPPED even if flattening
    fails (failure contained — it can no longer submit orders)
  - Unit tests added: circuit-breaker persistence/hydration (spec now 9, repo-backed),
    live-trading cancel (6) + emergency flatten (3), bots emergency-stop (3) — api package grew to
    **251 unit tests** (475 total) by increment 6; e2e now 15 tests (+account monitor 200/401)
- Increment 4: live bot routing + circuit-breaker layer (AGENTS.md §9/§10/§19)
  - New `live-trading` module: `LiveTradingService` (risk-gated broker execution),
    `CircuitBreakerService` (account/bot/global severities), `LiveAccountRiskTracker`
  - `BotRunnerService` now routes by `ExecutionMode`: PAPER → `PaperTradingService` (unchanged);
    DEMO/TESTNET/LIVE → `LiveTradingService.placeOrder` which ALWAYS runs the order through
    `evaluateOrder` + the circuit breaker BEFORE the adapter, persists a `provider='bybit'`
    `SUBMITTED` row, and enqueues reconciliation (fills converge via `getOrder`, never guessed)
  - Idempotency: `clientOrderId` dedupe before any broker call (AGENTS.md §16); live orders use a
    Bybit-safe `bolt-<runId8>-<timestamp>` suffix (no `:`, ≤36 chars)
  - Circuit breaker: trips the account + bot breakers on daily-loss/drawdown breaches
    (observed broker equity via the intraday tracker — honest values, never guesses), throws
    `CircuitBreakerOpenError`, which flips the bot to ERROR with **no auto-resume**; reduce-only
    exits always pass (a blocked exit could prevent de-risking)
  - Live bot-creation gate lifted: DEMO/TESTNET/LIVE require a fully configured live broker AND
    a mode↔environment match (`DEMO→demo`, `TESTNET→testnet`, `LIVE→mainnet`) — a "demo" bot can
    never route to mainnet (fail-closed)
  - Broker held-quantity facts for live bots come from the adapter (`getPositions`), so a live
    bot never double-positions against its broker position
  - Unit tests: circuit-breaker.service (9), live-trading.service (10), bots.service gate (5),
    runner live-routing (3) — api package then 223 unit tests (now superseded by increment 5)
- Increment 3: `OrderReconciliationService` + `order-reconciliation` BullMQ queue
  - Compares pending live-provider orders against the broker's `getOrder` without fabricating
    fills; syncs fills/partial fills, fails orders the broker no longer knows (never left
    dangling), and logs divergences (terminal-local/open-remote, identity mismatch) as warnings
  - `ReconciliationProducer.enqueue(accountId?, delayMs?)` extracted and shared by the scheduler
    (30s periodic, live-only) and `LiveTradingService` (immediate after a live placement)
- Increment 2: `BrokersModule` + `BrokersService` (env-backed registry) and `GET /api/brokers`
  - Env validation hardens `BYBIT_*`: `BYBIT_ENVIRONMENT` enum (default `demo`) and the key/secret
    pair rule (partial pairs are refused at boot — fail-closed)
  - `BybitAdapter` constructed lazily from env only when a full credential pair is present;
    credentials never leave the process and never appear in API responses; public
    `environment()` accessor supports the mode↔env bot gate
  - Migration 8 (`AddBrokerReconciliation`): `provider` (default `paper`), `broker_status`,
    `last_synced_at` on `paper_orders` — groundwork for order reconciliation (AGENTS.md §17)
  - Unit tests: env.validation (7), brokers.service (6); e2e now 11 tests (2 brokers endpoint tests)
- Increment 1: `BybitAdapter` (`@trading-bolt/broker-adapters/src/bybit/`)
  - Signed REST client (`X-BAPI-*` HMAC-SHA256 headers), injectable `FetchLike` transport
  - `placeOrder` → `POST /v5/order/create` with `orderLinkId` = `clientOrderId` (idempotency key);
    fresh market orders returned as `SUBMITTED` (never a guessed fill state)
  - `cancelOrder`, `getOrder`, `getOpenOrders`, `getPositions`, `getAccountState` mapped to v5
  - Order-status mapping to the allowed `BrokerOrderStatus` set (unknown statuses fail loudly)
  - Instrument filters (qty lot size / price tick) normalize quantities + prices
  - Fail-closed: constructor requires `apiKey`/`apiSecret`; `environment` defaults to `demo`
  - Unit tests: adapter (14), mappers (24) — broker-adapters package now 73 tests
- Real demo/testnet smoke test pending credentials (mocks only for now)

### Phase 9 — Portfolio & Analytics (IN PROGRESS)

- Increment 7: per-bot / per-strategy trade analytics (2026-09-19)
  - Additive migration `1700000000011-AddBotOrderAttribution`: `paper_orders` now records `bot_id` and
    `bot_run_id` (nullable; manual orders stay NULL) with an `(account_id, bot_id)` index, and existing
    orders are backfilled through the immutable `bot_run_cycles` audit trail (`cycle.order_id ->
    paper_orders.id`) so historical bot trades gain attribution (AGENTS.md §13/§17)
  - `PaperTradingService.placeOrder` and `LiveTradingService.placeOrder` accept a server-side
    `botContext`/`botRunId` (never client input, mirroring the `riskConfig` pattern) supplied by
    `BotRunnerService`, so every bot-placed order is attributed on both paper and live (Binance
    testnet) paths; the DTOs are unchanged
  - New `GET /api/analytics/bots/:botId/trades` (JWT-gated, ownership-scoped via
    `BotRepository.findByUserIdAndId`): FIFO round trips rebuilt from the bot's own filled orders
    (`PaperOrderRepository.listFilledByAccountAndBot`) with strategy id + symbol in the payload
  - Web `/analytics` page: "Bot trade analytics" section under the account picker — bot dropdown
    filtered to the selected account, metric cards + recent-trades table, empty/loading/error states
  - No strategy, risk-engine or broker-adapter changes. Unit tests: api **329** (repo query 1,
    service bot analytics 3; **595** total), web typecheck/lint/`next build` pass; migration SQL
    reviewed (no database available in this environment to apply it)
- Increment 4: trade analytics frontend surface (2026-09-18)
  - The `/analytics` page now renders the FIFO trade metrics from `GET /api/analytics/trades/:accountId`
    for the selected paper account: trade count, win rate, net P&L, profit factor (`—` when there are
    no losing trades — never a fake infinite number), average win and average loss (metric cards reusing
    `MetricCard`/`formatMoney`/`formatRatio`)
  - Added a compact recent-trades table (most recent closed round trips first) with side badge
    (Long emerald / Short red), symbol, size, entry/exit price, close time and net P&L with profit/loss
    tone — driven by the FIFO `RoundTripTrade` rows; empty state when no round trips exist yet
  - `lib/analytics.ts` adds `tradeAnalytics()`, `RoundTripTrade`/`TradeMetrics`/`TradeAnalytics`
    types and a `formatNumber` helper (plain numbers, up to 4 dp) alongside the existing formatters;
    no API/backend changes
  - Web typecheck, lint and `next build` pass (`/analytics` route emitted)
- Increment 1: portfolio analytics API
  - New `analytics` module: `GET /api/analytics/portfolio/:accountId` (JWT-gated, ownership-scoped
    via `PaperAccountRepository.findByUserIdAndId`) returns current/peak equity, total return and
    max drawdown (decimal fractions), realized P&L, last position value and the full immutable equity
    curve rebuilt from `paper_portfolio_snapshots`
  - `portfolio-metrics.ts`: pure, deterministic metrics over the equity curve built with `@trading-bolt/shared`
    decimal math (AGENTS.md §14) — running-peak drawdown (never below running peak, 0 on flat/rising
    windows), `(end-start)/start` total return, zero-start guard, 8-dp ratio rounding; no snapshots
    falls back to flat account state
  - `PaperPortfolioRepository.listByAccount` (ascending `created_at`) added + exported so the equity
    curve can be rebuilt without replaying candles (AGENTS.md §13)
  - No schema change (no migration). Unit tests: portfolio-metrics (7), analytics.service (4), repo
    query shape (1) — api package now **288 unit tests** (554 total)
- Increment 2: analytics frontend page
  - New `/analytics` page (JWT-gated): paper-account picker, metric cards (equity, peak equity, total
    return, max drawdown, realized P&L) and the equity curve rendered with the existing `EquityChart`
    (`lightweight-charts`); empty state when the user has no paper account
  - `apps/web/src/lib/analytics.ts` fetcher + `formatMoney`/`formatRatio` helpers; `EquityChart` prop
    relaxed to a minimal `{ timestamp, equity }` point type so both backtest and portfolio curves
    share it; dashboard nav link added. Web typecheck/lint/`next build` pass (route `/analytics`)
- Increment 3: FIFO trade analytics API
  - New `GET /api/analytics/trades/:accountId` (JWT-gated, ownership-scoped) returns win rate, win/loss
    counts, gross profit/loss, average win/loss, net P&L, total fees and profit factor
    (`null` when there are no losing trades — never a fake infinite number), plus the most recent
    closed round trips
  - `trade-metrics.ts`: pure FIFO engine over filled orders per symbol — buys match sells oldest-first
    (and sells match buys for shorts), partial closes leave the residual lot open, an order exceeding
    the open side flips direction, and fees are allocated pro-rata to the matched quantity
    (AGENTS.md §14)
  - `PaperOrderRepository.listFilledByAccount` (`filled_quantity > 0`, ascending, bounded lookback)
    added so partial fills on cancelled orders are included; no schema change
  - Unit tests: trade-metrics (13), analytics.service trade cases (3), repo query shape (1) — api
    package now **305 unit tests** (571 total)
- Not yet: a cross-bot per-strategy aggregation view (roll several bots sharing one strategy up into a
  single strategy report); per-account performance reports and the trade analytics frontend surface
  shipped in increments 2–6

---

## Phase 7 Details — What Is Done

| Component                                  | Status                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Bot lifecycle state machine                | COMPLETE (strict transition matrix)                                              |
| Bot execution order-intent derivation      | COMPLETE (`buildCycleIntent`, entry/exit/hold)                                   |
| Bot timing (interval → ms)                 | COMPLETE                                                                         |
| Bot scheduler abstraction (BullMQ queue)   | COMPLETE                                                                         |
| Bot execution processor                    | COMPLETE (consumes `bot-execution` queue)                                        |
| Bot runner service (advance one tick)      | COMPLETE                                                                         |
| Bot entity + BotRun entity                 | COMPLETE (TypeORM)                                                               |
| Bot repository + TypeORM impl              | COMPLETE                                                                         |
| Bot service (CRUD + lifecycle)             | COMPLETE                                                                         |
| Bot controller (all endpoints)             | COMPLETE (JWT-guarded)                                                           |
| Bot module wiring (AppModule)              | COMPLETE                                                                         |
| Bot migration                              | COMPLETE (`CreateBots6`)                                                         |
| Settle resting limit orders                | COMPLETE                                                                         |
| Bot risk config validation at creation     | COMPLETE                                                                         |
| Bot riskConfig wired to per-bot evaluation | COMPLETE (runner passes bot `riskConfig` to `placeOrder`, defaults when omitted) |
| Unit tests (lifecycle, cycle, timing)      | COMPLETE                                                                         |
| Unit tests (risk-config pass-through)      | COMPLETE (2 in paper-trading spec)                                               |
| Frontend `/bots` page                      | COMPLETE (create + lifecycle + monitor UI, `lib/bots.ts` typed JWT client)       |
| Per-cycle signal/order persistence         | COMPLETE (`bot_run_cycles` table, migration 7, runner writes per tick)           |
| Bot-runner unit tests (persistence)        | COMPLETE (4 tests: success, rejection, error, seq numbering)                     |
| Bot-cycle E2E through BullMQ               | COMPLETE (stub provider, API-driven, assertions on the persisted cycle row)      |
| Web cycle-history view                     | COMPLETE (monitor panel, 5s refetch)                                             |
| `GET :botId/runs/:runId/cycles` endpoint   | COMPLETE (JWT + ownership 404)                                                   |

---

## Phase 7 Details — What Is NOT Done

| Gap                                     | Severity | Description                                                                                                                   |
| --------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ~~Integration tests (Docker/DB/Redis)~~ | ~~Low~~  | **DONE 2026-09-15** — `db:migrate` (7 migrations) and `pnpm test:e2e` (9 tests) pass against Docker Compose Postgres + Redis. |
| CI verification                         | Low      | GitHub Actions workflow exists but has not been triggered on this branch.                                                     |
| ~~Per-cycle signal/order persistence~~  | ~~Med~~  | **DONE 2026-09-15** — `bot_run_cycles` table persisted per tick, E2E-verified.                                                |
| `/bots/[id]` detail page                | Low      | Detailed single-bot view is optional; `/bots` list + monitor panels are functional.                                           |

---

## Environment Status

| Component  | Status                   | Notes                                                                                                                |
| ---------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Frontend   | READY                    | `pnpm dev:web` (Next.js 16, port 3000)                                                                               |
| Backend    | READY                    | `pnpm dev:api` / `start:prod` (NestJS 12, port 4000) — boot verified against live infra                              |
| Worker     | READY                    | `pnpm dev:worker` (BullMQ smoke queue)                                                                               |
| PostgreSQL | READY (Docker)           | `docker compose up -d postgres` — postgres:17-alpine, healthy                                                        |
| Redis      | READY (Docker)           | `docker compose up -d redis` — redis:7-alpine, healthy                                                               |
| Docker     | READY                    | Docker 29.7.2 + Compose v5.5.1 available on dev machine (was previously unavailable)                                 |
| Tests      | PASS (571 unit + 15 e2e) | Shared 23, indicators 30, trading-engine 47, risk-engine 51, api 305, broker-adapters 115; 15 e2e in app.e2e-spec.ts |
| TypeScript | PASS                     | All 9 workspaces type-check cleanly                                                                                  |
| Lint       | PASS                     | eslint + oxlint, 0 warnings                                                                                          |
| Formatting | PASS                     | All files conform to Prettier                                                                                        |
| Build      | PASS                     | All packages/apps build successfully                                                                                 |

---

## Known Problems

1. ~~**`.env.example` has an uncommitted real JWT_SECRET**~~ — **FIXED 2026-09-15**: replaced
   `JWT_SECRET=tuyuyuyiuiuiu` (13 chars, failed the ≥32-char zod validation and was not a
   placeholder) with `JWT_SECRET=generate-a-random-32-character-minimum-secret`. `.env.example`
   now contains placeholders only, per AGENTS.md §21.

2. **MarketCandleEntity.interval column type** — **FIXED 2026-09-15**: `@Column({ length: 8 })`
   on the `CandleInterval` union type made TypeORM resolve the PG type to `Object`, which
   failed at entity-metadata validation during app boot ("Data type \"Object\" ... not supported
   by \"postgres\""). Fixed by declaring `type: 'varchar'`, matching the migration
   (`character varying(8)`). Unit tests did not catch this because they do not touch a real
   Postgres connection; the E2E suite now guards it.

3. ~~**Backtests API is not JWT-guarded**~~ — **FIXED 2026-09-15**: added class-level
   `@UseGuards(JwtAuthGuard)` to `backtests.controller.ts` (matching bots/paper endpoints),
   imported `UsersModule` into `BacktestsModule` for the guard's dependencies, and updated the web
   client (`lib/backtests.ts` now attaches the JWT) + both `/backtests` pages (auth-gated, redirect
   to `/login`). E2E assertions added for `GET/POST /api/backtests` returning 401 without a token
   (AGENTS.md §23).

4. ~~**Bot cycles record counters only**~~ — **DONE 2026-09-15**: per-tick signal/order history is
   now persisted in `bot_run_cycles` (migration 7) and surfaced via the API + `/bots` UI.

5. **Candle ordering bug (cache path)** — **FIXED 2026-09-15**: `MarketsService.getCandles` served
   `findLatest` rows newest-first (DESC at `typeorm-market-candle.repository.ts`), but strategies,
   backtests and the lightweight-charts UI all require chronological (oldest-first) order. The
   cache path therefore produced wrong signals/backtests as soon as candles were stored. Fixed by
   returning store reads in ascending order from `MarketsService`; the new
   `'returns candles from a fresh store in chronological order'` unit test locks the contract.

6. **BullMQ custom jobId with `:`** — **FIXED 2026-09-15**: `bot-scheduler.ts` enqueued with
   `jobId: \`${run.id}:${action}\``, which BullMQ rejects (`Custom Id cannot contain :`), so any bot
start tick failed in production. Changed to `${runId}-${action}`. Surfaced by the new bot-cycle
   E2E test.

7. **`decimalTransformer.from` stringified NULL** — **FIXED 2026-09-15**: `from: (value) =>
String(value)` turned `NULL` money columns into the string `"null"`, so a bot without a
   take-profit crashed in `buildCycleIntent` with `[DecimalError] Invalid argument: null` (`one.plus("null")`).
   Fixed the transformer to return `null` for null/undefined input (protects every nullable
   money column across bots/paper/backtests) and hardened `buildCycleIntent` to treat `undefined`
   like `null`. New unit tests cover both. Surfaced by the bot-cycle E2E test.

8. **Circuit-breaker state is in-memory (MVP)** — **FIXED 2026-09-15**: trip/reset state now
   persists to the `circuit_breakers` table (migration 9) and the registry is hydrated at boot, so
   a restart never auto-closes an OPEN breaker. `assertTradingAllowed` persists each trip;
   `reset` deletes the row (AGENTS.md §19).

9. **Single configured broker account (MVP)** — **KNOWN, 2026-09-15**: Bybit credentials are
   process-global env, so every live account maps to the same broker account. The position
   reconciliation compares each live account's local ledger against that one broker view; a user
   running several Bolt accounts against one Bybit account will see cross-account divergences
   until per-account broker accounts are supported. Detection-only, so no wrong numbers are ever
   written (AGENTS.md §17).

---

## Current Architecture

```text
Frontend (Next.js 16)
    ↓ HTTP/WebSocket
NestJS API (apps/api, port 4000)
    ↓
  ┌──────────────────────────────────────────────┐
  │ Auth  Users  Sessions  Markets  Strategies   │
  │ Backtests  PaperTrading  Bots  Health         │
  └──────────────────────────────────────────────┘
    ↓
  ┌──────────────────────────────────────────────┐
  │ @trading-bolt/shared                         │
  │ @trading-bolt/indicators                     │
  │ @trading-bolt/trading-engine                 │
  │ @trading-bolt/risk-engine                    │
  │ @trading-bolt/backtesting                    │
  │ @trading-bolt/broker-adapters (PaperBroker)  │
  └──────────────────────────────────────────────┘
    ↓
PostgreSQL (TypeORM, manual migrations via tsx)
    ↓
Redis (ioredis, BullMQ for bot-execution queue)
    ↓
BullMQ (BotExecutionProcessor)
```

---

## Current Database Migrations

| Migration       | Name                      | Purpose                                                                          |
| --------------- | ------------------------- | -------------------------------------------------------------------------------- |
| `1700000000000` | `CreateAppMeta`           | Application metadata table                                                       |
| `1700000000001` | `CreateUsers`             | Users table                                                                      |
| `1700000000002` | `CreateSessions`          | Sessions table (JWT refresh tokens)                                              |
| `1700000000003` | `CreateMarketCandles`     | Market candle storage                                                            |
| `1700000000004` | `CreateBacktests`         | Backtest + BacktestTrade + BacktestEquityPoint                                   |
| `1700000000005` | `CreatePaperTrading`      | Paper accounts, orders, positions, portfolio snapshots                           |
| `1700000000006` | `CreateBots`              | Bots + bot_runs tables                                                           |
| `1700000000007` | `CreateBotRunCycles`      | Per-cycle signal/order history for bot runs (idx run_id, run+seq)                |
| `1700000000008` | `AddBrokerReconciliation` | `provider`/`broker_status`/`last_synced_at` on `paper_orders` for reconciliation |
| `1700000000009` | `AddCircuitBreakers`      | Persistent `circuit_breakers` table (severity PK, reason, tripped_at)            |
| —               | Applied live              | All 9 migrations applied against Docker PostgreSQL on 2026-09-15                 |

---

## Current API Endpoints

| Method | Path                                  | Auth | Purpose                              |
| ------ | ------------------------------------- | ---- | ------------------------------------ |
| GET    | `/api/health`                         | No   | Liveness check                       |
| GET    | `/api/ready`                          | No   | Readiness check (DB/Redis)           |
| POST   | `/api/auth/register`                  | No   | User registration                    |
| POST   | `/api/auth/login`                     | No   | User login                           |
| POST   | `/api/auth/logout`                    | Yes  | Logout (revoke refresh)              |
| GET    | `/api/auth/me`                        | Yes  | Current user                         |
| GET    | `/api/markets/symbols`                | Yes  | Supported symbols                    |
| GET    | `/api/markets/:symbol/candles`        | Yes  | Candle history                       |
| GET    | `/api/markets/:symbol/ticker`         | Yes  | Latest ticker                        |
| GET    | `/api/strategies`                     | Yes  | List registered strategies           |
| POST   | `/api/strategies/evaluate`            | Yes  | Evaluate strategy on candles         |
| POST   | `/api/backtests`                      | Yes  | Run + store backtest                 |
| GET    | `/api/backtests`                      | Yes  | List stored backtests                |
| GET    | `/api/backtests/:id`                  | Yes  | Backtest detail                      |
| POST   | `/api/paper/accounts`                 | Yes  | Create paper account                 |
| GET    | `/api/paper/accounts`                 | Yes  | List paper accounts                  |
| POST   | `/api/paper/accounts/:id/orders`      | Yes  | Place paper order                    |
| GET    | `/api/paper/accounts/:id/orders`      | Yes  | List orders                          |
| GET    | `/api/paper/accounts/:id/positions`   | Yes  | List positions                       |
| GET    | `/api/paper/accounts/:id/portfolio`   | Yes  | Portfolio summary                    |
| POST   | `/api/bots`                           | Yes  | Create bot                           |
| GET    | `/api/bots`                           | Yes  | List user's bots                     |
| GET    | `/api/bots/:botId`                    | Yes  | Get bot detail                       |
| GET    | `/api/bots/:botId/monitor`            | Yes  | Monitor bot + portfolio + position   |
| GET    | `/api/bots/:botId/runs`               | Yes  | List bot runs                        |
| GET    | `/api/bots/:botId/runs/:runId/cycles` | Yes  | List cycles for a bot run            |
| POST   | `/api/bots/:botId/start`              | Yes  | Start bot                            |
| POST   | `/api/bots/:botId/pause`              | Yes  | Pause bot                            |
| POST   | `/api/bots/:botId/resume`             | Yes  | Resume bot                           |
| POST   | `/api/bots/:botId/stop`               | Yes  | Stop bot                             |
| POST   | `/api/bots/:botId/emergency-stop`     | Yes  | Emergency stop (flatten live + stop) |
| POST   | `/api/bots/:botId/recover`            | Yes  | Recover bot from ERROR               |
| GET    | `/api/brokers`                        | Yes  | List executors (no credentials)      |
| GET    | `/api/brokers/account`                | Yes  | Live broker account monitor view     |
| POST   | `/api/brokers/orders/:orderId/cancel` | Yes  | Cancel a live order                  |
| GET    | `/api/analytics/portfolio/:accountId` | Yes  | Portfolio equity curve + metrics     |
| GET    | `/api/analytics/trades/:accountId`    | Yes  | FIFO round trips + trade metrics     |

---

## Current Frontend Pages

| Route             | Page                   | Status                                                             |
| ----------------- | ---------------------- | ------------------------------------------------------------------ |
| `/`               | Landing / redirect     | Static                                                             |
| `/login`          | Login                  | Functional                                                         |
| `/register`       | Register               | Functional                                                         |
| `/dashboard`      | Dashboard (auth-gated) | Placeholder                                                        |
| `/markets`        | Markets (charts)       | Functional                                                         |
| `/backtests`      | Backtest runner        | Functional                                                         |
| `/backtests/[id]` | Backtest detail        | Functional                                                         |
| `/bots`           | Functional             | Create + lifecycle + monitor + cycle history + live emergency stop |
| `/live-broker`    | Functional             | Live broker monitor + cancel open orders (polls every 5s)          |
| `/analytics`      | Functional             | Portfolio equity curve + performance metrics (account picker)      |
| `/bots/[id]`      | Not implemented        | Detailed single-bot view (optional)                                |

---

## Broker State

**Binance Testnet — primary live broker (increments 1–8 done).** `BinanceAdapter` +
HMAC `BinanceHttpClient` in `@trading-bolt/broker-adapters` (testnet base
`https://testnet.binance.vision`), BINANCE env validation with a mainnet production-only guard, and
`BrokersService` as the active-provider router — live execution, cancellation, reconciliation,
emergency flatten and the account monitor all route through `provider()='binance'` when credentials
are present, with Bybit as the fallback. Spot semantics documented at the adapter: no cost basis and
no shorts (positions derived from balances), `reduceOnly` omitted, protective brackets placed as
SELL limit-OCOs after a filled entry, and fill fees sourced from `/api/v3/myTrades` (quote-asset
commissions only; BNB-discount fees excluded by design).
**Remaining:** execute `smoke:binance` against testnet (needs outbound network from the operator's
machine; this dev environment has none), fee==BNB/base conversion (needs a price oracle), and
bracket attachment for resting (limit) entries (currently fail-closed).

**Bybit — fallback provider.** The Bybit adapter, env-backed `BrokersModule`/`GET /api/brokers`, the
`order-reconciliation` engine (service + queue + processor + periodic sweep), the risk-gated live
execution path (`LiveTradingService`) with the persistent circuit-breaker layer (hydration at boot),
live order cancellation, per-bot emergency stop (kill-switch flatten, reduce-only, never blocked by
breakers), the live broker account monitor (`GET /api/brokers/account`), local-vs-broker position
reconciliation (read-only, divergence logging), and the frontend live-broker monitor +
order/emergency-stop controls (`/live-broker`, `/bots`) are all in place and unit-tested against
mocks. Live bot creation requires matching credentials+environment, and DEMO/TESTNET/LIVE bots route
through risk checks before any adapter call.
**Remaining:** an execution-mode selector in the bot creation form (backend gate exists; PAPER-only
UI today), re-evaluation of the single-broker-account model (Known Problem #9).

---

## Last Completed Task

1. **Phase 9 — Increment 7: per-bot trade analytics (2026-09-19)** — additive migration
   `1700000000011-AddBotOrderAttribution` links `paper_orders` to bots and runs (`bot_id`/`bot_run_id`,
   nullable, `(account_id, bot_id)` index) and backfills historical orders through the immutable
   `bot_run_cycles` audit trail. `PaperTradingService`/`LiveTradingService` persist the link from a
   server-side `botContext`/`botRunId` (never client input) so every bot order on paper and Binance
   testnet is attributed; `BotRunnerService` supplies it. New `GET /api/analytics/bots/:botId/trades`
   (JWT + ownership via `BotRepository`) returns FIFO round trips + metrics for one bot. Web
   `/analytics` adds a per-bot section (bot selector filtered by account, metric cards, recent-trades
   table). No strategy/risk/broker changes. Unit tests: api **329** (**595 total**), web
   typecheck/lint/`next build` pass; migration SQL reviewed (no DB available here to apply it).
2. **Phase 9 — Increment 6: performance report CSV export (2026-09-18)** — added
   `GET /api/analytics/performance/:accountId/export` (JWT-gated, ownership-scoped) returning a
   `text/csv` attachment via `StreamableFile` (`performance-<accountId>.csv`). New pure
   `performance-export.ts` — deterministic CSV rendering of the report: a `metric,value` summary
   (account, equity/peak/return/drawdown/realized P&L/position value, trade count, win rate, net P&L,
   profit factor, total fees) followed by a flat daily+weekly+monthly period table
   (`granularity,period,start_equity,end_equity,return_pct,pnl,snapshots`). Raw decimal strings
   preserved verbatim, `null` returns/profit factor render empty, cells quoted with doubled quotes
   when they contain `,`, `"`, `\r` or `\n`. `AnalyticsService.performanceReportCsv` reuses the same
   ownership-scoped loaders. Web `/analytics` gains a "Download CSV" button (blob download via the
   `API_BASE` fetch with the stored Bearer token) next to "Print report", with exporting/error state.
   No migration. Unit tests: api **325** (export 7, service csv 2; 591 total), web
   typecheck/lint/`next build` pass.
3. **Phase 9 — Increment 5: performance report (2026-09-18)** — added
   `GET /api/analytics/performance/:accountId` (JWT-gated, ownership-scoped): a single payload
   combining the portfolio metrics, FIFO trade metrics and per-period (day/week/month) equity returns.
   New pure `performance-report.ts` module — `periodReturns(curve, granularity)` buckets the equity
   curve by UTC calendar periods (Monday-based weeks, months), skips empty periods chaining from the
   previous period's close, uses each opening period's first observed point as its start, and never
   divides by zero (`returnPercent` is `null` when starting equity is zero; 8-dp rounding). Refactored
   `AnalyticsService` to share `findAccount`/`portfolioFor`/`tradesFor` loaders (single ownership
   check) behind `portfolioAnalytics`/`tradeAnalytics`/`performanceReport`. Web `/analytics` page
   reworked to a single report query: portfolio cards + equity curve + trade section now read from
   the report, a new "Period returns" section renders Daily/Weekly/Monthly tables (null returns as
   `—`, tones, P&L, point counts), plus a "Print report" button (`window.print()`). No migration
   (read-only aggregation). Unit tests: api **316** (periodReturns 9, service report 2; 582 total),
   web typecheck/lint/`next build` pass.
4. **Phase 9 — Increment 4: trade analytics UI (2026-09-18)** — extended the `/analytics` page
   with the FIFO trade metrics from `GET /api/analytics/trades/:accountId` (trade count, win rate, net
   P&L, profit factor with a `—` when no losing trades, average win/loss as metric cards) plus a compact
   recent-trades table (Long/Short badge, symbol, size, entry/exit, close time, net P&L with tone; empty
   state). Added `tradeAnalytics()`/types + `formatNumber` to `lib/analytics.ts`. No API/backend changes;
   web typecheck/lint/`next build` pass.
5. **Phase 9 — Increment 3: FIFO trade analytics (2026-09-18)** — added
   `GET /api/analytics/trades/:accountId` (JWT-gated, ownership-scoped) returning win rate, win/loss
   counts, gross profit/loss, average win/loss, net P&L, total fees and profit factor (`null` when there
   are no losing trades), plus the most recent closed round trips. Pure `trade-metrics.ts` FIFO engine
   matches filled orders per symbol oldest-first (shorts included, partial closes leave residual lots,
   direction flips handled, fees allocated pro-rata to the matched quantity). Added
   `PaperOrderRepository.listFilledByAccount` (`filled_quantity > 0`, ascending, bounded lookback) so
   partial fills on cancelled orders count. No migration. Unit tests: api **305** (trade-metrics 13,
   service 3, repo 1; 571 total).
6. **Phase 9 — Increment 2: portfolio analytics UI (2026-09-18)** — added the `/analytics` page
   (JWT-gated) with a paper-account picker, metric cards (equity, peak equity, total return, max
   drawdown, realized P&L) and the equity curve rendered through the shared `EquityChart` (prop
   relaxed to a minimal `{ timestamp, equity }` point type shared with the backtest chart). Added
   `apps/web/src/lib/analytics.ts` (fetcher + `formatMoney`/`formatRatio`) and a dashboard nav link.
   Web typecheck/lint/`next build` pass (`/analytics` route emitted); api tests unchanged (554 unit).
7. **Phase 9 — Increment 1: portfolio analytics (2026-09-18)** — added the `analytics` module with
   `GET /api/analytics/portfolio/:accountId` (JWT-gated, ownership-scoped). Deterministic decimal
   metrics over the immutable equity snapshot curve (`portfolio-metrics.ts`: current/peak equity,
   total return, running-peak max drawdown, 8-dp ratio rounding, zero-start guard) plus
   `PaperPortfolioRepository.listByAccount` (ascending) exported for history rebuild. No migration
   (no schema change). Unit tests: api **288** (metrics 7, service 4, repo 1; 554 total).
8. **Phase 8 — Increment 11: Binance testnet smoke-test tooling (2026-09-18)** — added
   `apps/api/scripts/smoke-binance.ts` (`pnpm --filter api smoke:binance`), an adapter-level driver
   that exercises the signed live path end-to-end with one small trade (entry → OCO bracket → myTrades
   fee sweep → flatten), fail-closed against mainnet and insufficient balances, with `--dry-run` /
   `--leave` modes. Lint/format hooks extended to `scripts/`. Not yet executed here (no outbound
   network to testnet).
9. **Phase 8 — Increment 10: Binance fill-fee accounting (2026-09-18)** — `BinanceAdapter.getOrder`
   sweeps `/api/v3/myTrades` and reports cumulative quote-asset commissions (BNB/base fees excluded,
   never price-guessed). Reconciliation now syncs `paper_orders.fees` from the broker on every
   faithful sweep (not just transitions), and `listPendingLive` includes never-reconciled FILLED
   orders so a market entry's real fees settle on its first sweep; divergent views never touch local
   fees. Unit tests api **275**, broker-adapters **115** (541 total).
10. **Phase 8 — Increment 9: Binance OCO protective brackets (2026-09-18)** — added the optional
   `BrokerAdapter.attachProtectiveBracket` contract and a `BinanceAdapter` implementation that submits
   a SELL limit-OCO (`/api/v3/order/oco`, take-profit SELL leg + stop-limit SELL leg, `GTC`,
   `listClientOrderId` idempotency, fail-validated geometry/lot/tick). The Binance create path now
   accepts SL/TP intent on market buy entries only (sell closes and resting limits stay fail-closed).
   `LiveTradingService` attaches the bracket synchronously after a FILLED buy and persists the broker
   order-list id via migration 10 (`paper_orders.bracket_order_list_id`); a failed bracket triggers an
   immediate reduce-only reversal so no unprotected position is left open. Unit tests api **271**,
   broker-adapters **104** (524 total).
11. **Phase 8 — Increment 8: Binance Testnet becomes the primary live broker (2026-09-18)** — added the
    `@trading-bolt/broker-adapters/src/binance/` module (`BinanceAdapter`, HMAC-SHA256
    `BinanceHttpClient`, REST mappers with step helpers, 14-test spec), `BINANCE_*` env validation
    (default `testnet`; mainnet production-only guard), and reworked `BrokersService` into an
    active-provider router — `provider()` = binance when its credential pair is present, else bybit,
    else null. Live execution/cancellation, order + position reconciliation, emergency flatten and
    the account monitor now route through the active adapter and pass `{ symbol }` to `getOrder`/
    `cancelOrder`. Spot semantics documented at the adapter (no cost basis/shorts, `reduceOnly`
    omitted, SL/TP rejected fail-closed until OCO). Web `BrokerExecutorInfo` now includes `"binance"`
    and the `/bots` page prefers the Binance executor. Unit tests api **266**, broker-adapters **95**
    (512 total); e2e assertions updated (`environment` `'testnet'` when unconfigured, binance executor
    listed).
12. **Phase 8 — Increment 7: frontend live broker monitor + order controls (2026-09-15)** — added the
    `/live-broker` page (JWT-gated, 5s polling of `GET /api/brokers/account`): environment badge,
    overview gems (equity/free/open counts), open circuit breakers, balances, positions and open
    orders, with a fail-closed "not configured" empty state and per-surface broker warnings instead
    of a blank page. Open orders now carry a `localId` (`LiveOrderView`, enriched in
    `getAccountView` via `PaperOrderRepository.findLiveByBrokerOrderIds`) so orders placed by Trading
    Bolt expose a Cancel button that calls the ownership-checked
    `POST /api/brokers/orders/:orderId/cancel`; orders external to Bolt show "external" and are never
    cancelable from here. Added a red emergency-stop button in the `/bots` list for live-capable bots
    (executionMode ≠ PAPER, RUNNING/PAUSED/STARTING/STOPPING, confirm dialog →
    `POST /api/bots/:botId/emergency-stop`). New typed web client `lib/brokers.ts`
    (`getAccountView`, `cancelLiveOrder`), `lib/bots.ts` `emergencyStopBot`, dashboard + `/bots`
    navigation links. New test: getAccountView local-id enrichment (1) — api **252 unit tests**
    (476 total); e2e **15**; web build passes with the new route.
13. **Phase 8 — Increment 6: live account monitor + position reconciliation (2026-09-15)** — added
    `GET /api/brokers/account` (`LiveAccountController` + `LiveTradingService.getAccountView`): a
    JWT-guarded read-only view of the configured broker (wallet balances + summed equity/free, broker
    positions + open orders, open circuit breakers, per-surface warnings; never credentials; fails
    closed to `configured:false` with no adapter). Added `PositionReconciliationService` (AGENTS.md
    §17): computes each live account's expected net from the signed-fill ledger identity
    (`PaperOrderRepository.listLiveAccounts`), compares against `adapter.getPositions()`, and logs
    `POSITION_DIVERGENCE` — read-only, never auto-corrects. Wired into `ReconciliationProcessor`, which
    now returns `ReconciliationRunOutcome` (order + position passes per job). New tests:
    position-reconciliation (10), getAccountView (4) — api **251 unit tests** (475 total); e2e **15**
    (+`GET /api/brokers/account` 200 fail-closed + 401).
14. **Phase 8 — Increment 5: live order management + emergency controls (2026-09-15)** — added
    `POST /api/brokers/orders/:orderId/cancel` (`LiveOrdersController` + `LiveTradingService.cancelOrder`,
    server-side ownership, only `provider='bybit'`, idempotent, status converges via reconciliation) and
    `POST /api/bots/:botId/emergency-stop` (`BotsService.emergencyStop` → `LiveTradingService.emergencyFlatten`:
    cancels open live orders on the symbol and flattens the broker-held position with reduce-only market
    orders; the bot always stops even when flattening fails). Made the circuit breaker persistent —
    migration 9 `circuit_breakers` + `CircuitBreakerRepository` (TypeORM) + hydration at boot, so a
    restart never auto-closes an OPEN breaker. `LiveTradingModule` gains `UsersModule` (for the JWT guard)
    and exports `PaperAccountRepository` from `PaperTradingModule`. New tests: breaker persistence/
    hydration, cancel (6), emergency flatten (3), bots emergency-stop (3) — api now 237 unit tests
    (461 total); e2e now 13 (cancel + emergency-stop 401).
15. **Phase 8 — Increment 4: live bot routing + circuit breaker (2026-09-15)** — added the
    `live-trading` module (`LiveTradingService`, `CircuitBreakerService`, `LiveAccountRiskTracker`)
    and wired risk-gated routing into `BotRunnerService` by `ExecutionMode`. Every live order passes
    `evaluateOrder` + the breaker before reaching the adapter, is persisted as `provider='bybit'`
    `SUBMITTED`, and enqueues reconciliation. Daily-loss/drawdown breaches trip account+bot breakers
    (`CircuitBreakerOpenError` → bot ERROR, no auto-resume); reduce-only exits never block. Bot
    creation gate now requires a configured broker AND a mode↔environment match. Extracted
    `ReconciliationProducer` (shared by scheduler + live placement). 27 new unit tests (breaker 9,
    live-trading 10, bots gate 5, runner routing 3); api now 223 unit tests; 447 total + 11 e2e.
16. **Phase 8 — Increment 3: order reconciliation engine (2026-09-15)** — added
    `OrderReconciliationService` (reads pending `provider='bybit'` non-terminal orders, probes the
    broker with `getOrder`, copies fills verbatim, fails orders missing at the broker, logs
    terminal/open or identity divergences without overwriting), a `order-reconciliation` BullMQ
    processor + 30s periodic scheduler (live-only), scoped sweeps, and a `listPendingLive`
    repository query. `ReconciliationJob`/`ReconciliationOutcome` types added to the shared package.
    9 unit tests; no live routing yet at the time.
17. **Phase 8 — Increment 2: API brokers module + env-backed registry (2026-09-15)** — added
    `BrokersModule`/`BrokersService` (registry over `PaperBroker` + `BybitAdapter`, lazy adapter
    construction, no credentials ever exposed) and JWT-guarded `GET /api/brokers`. Env validation
    hardens `BYBIT_*`: `BYBIT_ENVIRONMENT` enum (`demo|testnet|mainnet`, default `demo`) and a
    super-refined key/secret pair rule (partial pairs refuse boot). Migration 8
    (`AddBrokerReconciliation`, applied) adds `provider`/`broker_status`/`last_synced_at` to
    `paper_orders` as reconciliation groundwork. 13 new unit tests (env.validation 7, brokers.service 6) + 2 e2e tests.
18. **Phase 8 — Increment 1: `BybitAdapter` (2026-09-15)** — built the Bybit v5 adapter in
    `@trading-bolt/broker-adapters` behind the existing `BrokerAdapter` abstraction: signed REST
    client (HMAC-SHA256, injectable `FetchLike` transport, no runtime deps added), order
    place/cancel/get/list, positions and unified wallet mapping, strict order-status mapping with
    loud failure on unknown statuses, quantity/price normalization from per-symbol instrument
    filters, `orderLinkId` = `clientOrderId` idempotency, honest `SUBMITTED` status on created
    market orders (fills converge via getOrder/reconciliation). Fail-closed constructor:
    `apiKey`/`apiSecret` required, `environment` defaults to `demo`. 38 new unit tests (adapter 14,
    mappers 24); broker-adapters package now 73. Real smoke test deferred until demo credentials
    arrive (mock-only for now).
18. **Persisted per-cycle signals/orders + bot-cycle E2E (2026-09-15)** — added `bot_run_cycles`
    (entity, migration 7, repository), wired the bot runner to persist one record per tick
    (signal, order, rejection, or error; success and failure paths), exposed
    `GET /api/bots/:botId/runs/:runId/cycles` with ownership enforcement, surfaced cycles in the
    `/bots` monitor panel, added 4 runner persistence tests + 1 ordering test + 1 transformer test +
    1 bot-cycle TP regression test, and wrote an end-to-end test that drives a real bot + BullMQ
    worker through the HTTP API against live Postgres/Redis with a deterministic stub market data
    provider (buys the annotated cross on the last bar). **9/9 E2E tests and 371 unit tests pass.**
19. **Fixed three latent defects surfaced by the new E2E** — (a) `MarketsService.getCandles`
    returned newest-first rows to strategies/backtests/charts (cache path), fixed to chronological;
    (b) BullMQ `jobId` contained `:`, which BullMQ forbids — any bot start tick would fail;
    (c) `decimalTransformer.from` turned `NULL` money columns into the string `"null"`, crashing
    bots without take-profit with `[DecimalError] Invalid argument: null`. All three are now unit- and
    E2E-covered. Migration `1700000000007` applied to the live database.
20. **JWT-guarded the backtests API (2026-09-15)** — closed the auth inconsistency flagged in
    Known Problems #3 (see above).

---

## Verification Results (2026-09-15)

```text
pnpm format:check  ✅  All matched files use Prettier code style
pnpm lint          ✅  0 warnings, 0 errors
pnpm typecheck     ✅  All 9 workspaces pass
pnpm test          ✅  476 tests across 6 packages/apps (all pass)
pnpm test:e2e      ✅  15 tests pass (Docker Postgres + Redis running)
pnpm db:migrate    ✅  All 9 migrations applied to live PostgreSQL
GET /api/health    ✅  status ok (live boot, start:prod)
GET /api/ready     ✅  database:ok, redis:ok, queue:ok (live boot)
```

---

## Recommended Next Task

**Phase 9 — next: per-strategy / per-bot analytics.**

1. Per-strategy/per-bot analytics (if wanted): requires linking `paper_orders` to bots — a schema
   change and migration (confirm before proceeding, AGENTS.md §35).
2. Otherwise the analytics workflow from §42 is complete; the next meaningful product step is moving
   the §42 workflow fully behind the Binance Testnet live path and hardening it (Phase 8/9 steady
   state), or beginning Phase 10 AI-assisted strategy analysis.
3. Separately: execute `smoke:binance` against Binance Testnet from a networked machine once available
   — this remains the only unverified live path (Phase 8).

---

## Blockers

None blocking. Docker, PostgreSQL and Redis are now available locally. Migrations, E2E tests and
live `/api/health` + `/api/ready` checks all pass against live infrastructure.
