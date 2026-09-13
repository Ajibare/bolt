# Trading Bolt — Phase 0 Implementation Plan

**Status:** Planning — awaiting review and approval
**Phase:** 0 — Foundation
**Project:** Trading Bolt
**Primary Exchange:** Bybit (Phase 8+)
**Backend:** NestJS + TypeScript
**Frontend:** Next.js + TypeScript
**Database:** PostgreSQL
**Cache / Queues:** Redis + BullMQ
**Package Manager:** pnpm (workspace monorepo)

> This document replaces the earlier draft and fully satisfies the requirements of
> `AGENTS.md` §43 and `README.md` §49. It is a **planning document only**.
> No application code is to be written until this plan is reviewed and approved.

---

# 1. Project Assessment

## 1.1 Current State

The repository at `trading-bolt/` currently contains **documentation only**:

```text
trading-bolt/
│
├── README.md                (master product + technical specification)
├── AGENTS.md                (engineering rules and constraints)
└── docs/
    ├── IMPLEMENTATION_ROADMAP.md     (13-phase complete roadmap)
    └── PHASE_0_IMPLEMENTATION_PLAN.md (this document)
```

## 1.2 What Exists

| Item                   | Status                                                           |
| ---------------------- | ---------------------------------------------------------------- |
| Source code            | **None** — no `apps/`, `packages/`, or `src/`                    |
| Package configuration  | **None** — no `package.json`, no lockfile, no workspace file     |
| Git configuration      | **None** — no `.git`, no `.gitignore`, `git init` not run        |
| Environment files      | **None** — no `.env`, no `.env.example`                          |
| Database               | **None** — no migrations, no schema                              |
| Docker                 | **None** — no `docker-compose.yml`, no `Dockerfile`s             |
| Testing infrastructure | **None**                                                         |
| CI                     | **None**                                                         |
| Documentation          | `README.md`, `AGENTS.md`, `IMPLEMENTATION_ROADMAP.md`, this plan |

## 1.3 Local Toolchain (verified)

| Tool    | Version           | Notes                                         |
| ------- | ----------------- | --------------------------------------------- |
| Node.js | v24.12.0          | Available                                     |
| npm     | 11.6.2            | Available                                     |
| pnpm    | 11.15.1           | Available — recommended package manager       |
| git     | 2.52.0            | Available — repo not yet initialized          |
| Docker  | **Not installed** | `docker` and `docker compose` are unavailable |

**Important risk:** Docker is not installed on the development machine. The Docker/
Compose deliverables of Phase 0 therefore cannot be verified locally until either
Docker is installed or a non-Docker local fallback is approved (see §6.4 and §12 Risks).

## 1.4 What Must Be Created

Phase 0 must produce:

```text
Monorepo + workspace config
  ↓
Next.js web app
  ↓
NestJS API app
  ↓
Worker app
  ↓
Shared TypeScript package(s)
  ↓
PostgreSQL (Dockerized)
  ↓
Redis (Dockerized)
  ↓
BullMQ wiring
  ↓
Environment configuration (.env.example)
  ↓
ESLint / Prettier / TypeScript config
  ↓
Testing infrastructure
  ↓
Health checks
  ↓
Docker Compose
  ↓
CI (optional for initial approval)
  ↓
Development documentation
```

---

# 2. Architecture

## 2.1 System Layers

```text
Frontend (Next.js)
    ↓ HTTP/WebSocket
NestJS API (application services)
    ↓
Trading Engine  →  Strategy Engine → Risk Engine → Order Manager
    ↓
Broker Adapter (abstraction)
    ├── PaperBroker   (Phase 6)
    └── BybitAdapter  (Phase 8+)
Supporting infrastructure:
    PostgreSQL (source of truth) | Redis (cache/state/queues) | BullMQ (jobs) | Worker
```

## 2.2 Execution Pipeline (mandatory, every phase)

```text
Market Data
    ↓
Data Normalization
    ↓
Indicators
    ↓
Strategy          → produces a SIGNAL only
    ↓
Risk Engine       → APPROVED or REJECTED (deterministic, logged)
    ↓
Order Manager     → idempotent order lifecycle
    ↓
Broker Adapter    → PaperBroker or BybitAdapter
    ↓
Broker/Exchange
    ↓
Order Events → Trade → Position → Portfolio
```

**A strategy NEVER calls `placeOrder()` directly. This is enforced for all phases.**

## 2.3 Domain Separation

Modules stay separate and small:

```text
auth users accounts brokers markets strategies signals
backtesting risk orders trades positions portfolio bots
analytics ai notifications admin
```

## 2.4 Frontend

- Next.js (App Router), React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query,
  TradingView Lightweight Charts, WebSockets.
- Renders UI, visualization, and forms only.
- Never stores broker secrets, never executes orders, never makes risk decisions.

## 2.5 Backend

- NestJS with versioned `/api/v1/*` routes, DTO validation, guards, structured logging,
  configuration via `@nestjs/config`, health checks.
- Single authority for all financial operations.

## 2.6 Worker

- Dedicated Node worker process using BullMQ and Redis.
- Handles market-data processing, backtests, bot execution cycles, reconciliation,
  analytics, notifications.
- Long-running work never blocks API request cycles.

## 2.7 PostgreSQL

- Permanent source of truth: User, TradingAccount, Broker, BrokerConnection, Asset,
  Market, Strategy, StrategyVersion, Backtest, BacktestTrade, Bot, BotRun, Signal,
  Order, OrderEvent, Trade, Position, Portfolio, PortfolioSnapshot, RiskRule,
  Notification, AuditLog.
- Schema is introduced **incrementally** by phase. Phase 0 creates only the minimal
  schema needed for health checks and connectivity (see §11 Phase 0).
- Financial records are immutable, migrated via reviewable migrations.

## 2.8 Redis / BullMQ

- Redis: cache, real-time state, WebSocket fan-out, rate limiting, temporary bot state.
- BullMQ: queues for `market-data`, `backtesting`, `bot-execution`,
  `order-reconciliation`, `analytics`, `notifications`, `ai-processing`.
- Redis is **never** the permanent source of truth for financial records.
- Jobs are retryable, idempotent where possible, logged, and duplicate-protected.

## 2.9 Broker Abstraction

```text
broker-adapter (package)
    ├── broker.interface.ts   (generic interface)
    ├── paper/                (Phase 6, in-process)
    └── bybit/                (Phase 8+, REST + WebSocket)
```

The rest of the system depends on the interface, not on Bybit types.
Paper and live paths share the same abstraction; the execution implementation differs.

## 2.10 Bybit Boundary

- Bybit code is confined to `packages/broker-adapters/bybit`.
- Credentials exist only server-side, in environment variables; never in the frontend,
  API responses, or logs.
- Environment progression: Backtesting → Paper → Bybit Demo → Bybit Testnet →
  Small Live → Production Live.
- Phase 0 performs **no** Bybit connection of any kind (not even public endpoints).

---

# 3. Monorepo Structure

```text
trading-bolt/
│
├── apps/
│   ├── web/                       # Next.js frontend
│   │   ├── app/                   # App Router pages
│   │   ├── components/            # shadcn/ui + app components
│   │   ├── lib/                   # API client, query hooks
│   │   └── ...
│   ├── api/                       # NestJS backend
│   │   ├── src/
│   │   │   ├── app.module.ts
│   │   │   ├── config/
│   │   │   ├── common/            # guards, decorators, interceptors, filters
│   │   │   ├── health/
│   │   │   └── ...                # domain modules added per phase
│   │   └── test/
│   └── worker/                    # BullMQ worker process
│       └── src/
│           ├── main.ts
│           ├── queues/
│           └── processors/        # per-domain job processors
│
├── packages/
│   ├── shared/                    # shared types, constants, enums, utils
│   ├── trading-engine/            # strategy/order orchestration (Phase 3+)
│   ├── indicators/                # MA, RSI, etc. (Phase 3)
│   ├── backtesting/               # replay + metrics engine (Phase 4)
│   ├── risk-engine/               # risk rules, position sizing, circuit breaker (Phase 5)
│   └── broker-adapters/
│       ├── broker.interface.ts
│       ├── paper/                 # Phase 6
│       └── bybit/                 # Phase 8+
│
├── database/
│   └── migrations/                # SQL migrations (per ORM choice)
│
├── docker/
│   ├── api.Dockerfile
│   ├── web.Dockerfile
│   ├── worker.Dockerfile
│   └── init.sql                   # minimal DB bootstrap (health check)
│
├── docs/
│   ├── architecture/
│   ├── api/
│   ├── database/
│   ├── trading/
│   └── development/
│
├── scripts/
│   └── dev.sh                     # local non-Docker fallback helper
│
├── tests/                         # cross-app e2e suites
│
├── .env.example                   # placeholders only
├── .gitignore
├── .editorconfig
├── .prettierrc
├── .eslintrc / eslint.config.*
├── tsconfig.base.json
├── turbo.json (or npm/pnpm workspace scripts)
├── pnpm-workspace.yaml
├── package.json
├── docker-compose.yml
├── README.md
└── AGENTS.md
```

Empty Phase-0 packages (e.g. `indicators`, `risk-engine`) are either created with a
`package.json` + `tsconfig` stub or deferred until their phase. **Decision required**
(§12): defer them to keep the initial scaffold minimal.

---

# 4. Dependency Strategy

Rule (`AGENTS.md` §29): no dependency is added without justification. Nothing in
Phase 0 is installed for trading functionality; only for the scalable foundation.

## 4.1 Root / Workspace (Phase 0)

| Dependency                       | Purpose             | Justification                 |
| -------------------------------- | ------------------- | ----------------------------- |
| `typescript`                     | Shared TS toolchain | Required by all apps/packages |
| `eslint`, `@typescript-eslint/*` | Linting             | Required by `AGENTS.md`       |
| `prettier`                       | Formatting          | Required by `AGENTS.md`       |
| `@types/node`                    | Node typings        | Required by apps/packages     |

Dev-only; no runtime code. Run scripts are aggregated with `pnpm --filter` / `--recursive`.

## 4.2 apps/web (Phase 0 minimal)

| Dependency                                            | Purpose                                    |
| ----------------------------------------------------- | ------------------------------------------ |
| `next`, `react`, `react-dom`                          | Framework                                  |
| `typescript`, `@types/react`, `@types/react-dom`      | Typing                                     |
| `tailwindcss`, `postcss`, `autoprefixer`              | Styling                                    |
| `@tanstack/react-query`                               | Server-state management                    |
| `lucide-react`, shadcn/ui generated components + deps | shadcn/ui                                  |
| `lightweight-charts`                                  | Charting library (installed, not yet used) |

Deferred to later phases: auth providers, websocket clients beyond the platform's own
needs.

## 4.3 apps/api (Phase 0 minimal)

| Dependency                                                               | Purpose                              |
| ------------------------------------------------------------------------ | ------------------------------------ |
| `@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`             | Framework                            |
| `@nestjs/config`                                                         | `.env` + config validation           |
| `class-validator`, `class-transformer`                                   | DTO validation                       |
| `reflect-metadata`                                                       | NestJS metadata                      |
| `rxjs`                                                                   | NestJS dependency                    |
| `pg`                                                                     | PostgreSQL driver (or Prisma engine) |
| ORM: **TypeORM** (+ `@nestjs/typeorm`) **or Prisma** — decision required | Data access                          |
| `bullmq`, `ioredis`                                                      | Queues (wiring only in Phase 0)      |
| `joi` or `zod` (config schema validation)                                | Env validation                       |
| `pino-pretty`/`pino` (optional structured logging)                       | Logging                              |

## 4.4 apps/worker (Phase 0 minimal)

| Dependency                                              | Purpose           |
| ------------------------------------------------------- | ----------------- |
| `bullmq`, `ioredis`                                     | Queue consumption |
| `config` values shared from `api` or a `config` package | Env handling      |

## 4.5 packages/shared (Phase 0 minimal)

- `typescript` (dev), runtime deps: **none** (or `decimal.js` — see below).

## 4.6 Financial Decimal Strategy

- **Editors pick: `decimal.js`** (or built-in `Decimal` of choice). Used for every
  financial calculation (price, qty, fees, P&L, position size).
- Introduced as a `packages/shared` financial utility **in Phase 0** with unit tests,
  then reused by every trading phase. This is foundation, not trading logic.

## 4.7 Explicitly NOT installed in Phase 0

- No Bybit SDK or trading client.
- No strategy/backtest/risk/AI libraries.
- No Python.
- No unnecessary microservices/frameworks.

---

# 5. Environment Configuration

## 5.1 Files

- `.env.example` — committed, **placeholders only**.
- `.env` — local, never committed (added to `.gitignore`).
- Schema-validated at API/worker startup (fail-fast on invalid/absent required vars).

## 5.2 Placeholder Variables (final target set)

```env
# ── App ────────────────────────────────────────────────
NODE_ENV=development
APP_NAME=trading-bolt
API_PORT=4000
WEB_PORT=3000
LOG_LEVEL=info

# ── Database ───────────────────────────────────────────
POSTGRES_USER=bolt
POSTGRES_PASSWORD=
POSTGRES_DB=trading_bolt
DATABASE_URL=postgres://bolt:changeme@localhost:5432/trading_bolt

# ── Redis ──────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ── Auth (Phase 1+) ────────────────────────────────────
JWT_SECRET=
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_EXPIRES_IN=7d

ENCRYPTION_KEY=

# ── PostgreSQL connection limits (optional) ────────────
# PG_POOL_MIN=2
# PG_POOL_MAX=10

# ── Bybit (Phase 8+; placeholders only, never committed) ─
BYBIT_API_KEY=
BYBIT_API_SECRET=
BYBIT_ENVIRONMENT=demo

# ── AI (Phase 11+; placeholder only) ───────────────────
AI_API_KEY=
```

No real credentials are inserted at any point. Secrets are injected via environment
at deployment time only.

---

# 6. Docker Architecture

## 6.1 Targeted Compose Stack

```text
services:
  postgres :5432   PostgreSQL 16 (volume, healthcheck)
  redis    :6379   Redis 7 (healthcheck)
  api      :4000   NestJS API (depends_on healthy postgres+redis)
  worker           BullMQ worker (depends_on healthy api)
  web      :3000   Next.js (depends_on healthy api)
```

`docker compose up` starts the full development environment (`README.md` §34).

## 6.2 Image Strategy

```text
docker/
  api.Dockerfile    # multi-stage: build TS → run node dist
  web.Dockerfile    # multi-stage: build Next.js → run standalone server
  worker.Dockerfile # multi-stage: build TS → run node dist
```

All apps are built from the pnpm workspace root; volumes mount `node_modules`/dist
appropriately for local dev consistency.

## 6.3 Health Checks (Phase 0)

```text
/api/health   → liveness (process is up)
/api/ready    → readiness (DB, Redis, queue connectivity verified)
```

`postgres` and `redis` containers expose native healthchecks used by `depends_on`.
Worker exposes a registry/heartbeat via Redis so `/api/ready` can report queue health.

## 6.4 Local Fallback (required decision)

Docker is NOT installed on the development machine. To keep Phase 0 verifiable
locally, one of the following is required:

1. **Install Docker Desktop / Rancher Desktop** and proceed with the Compose stack, or
2. **Approve a non-Docker fallback** where PostgreSQL/Redis run as local binaries
   (or via `pg_ctl`/`memurai` equivalents on Windows) driven by `scripts/dev.sh`,
   with Compose files authored but verified later.

Default recommendation: option 1 (Docker), with option 2 as an approved interim for
this machine.

---

# 7. Development Scripts

Scripts are defined at the workspace root using `pnpm` filters/`--recursive`, and
per-app where granularity helps. Placeholder plan:

```jsonc
// package.json (root) — actual scripts finalized during Phase 0 implementation
{
  "scripts": {
    "dev": "pnpm --parallel -r dev", // web + api + worker
    "dev:web": "pnpm --filter web dev",
    "dev:api": "pnpm --filter api dev",
    "dev:worker": "pnpm --filter worker dev",
    "build": "pnpm -r build",
    "build:web": "pnpm --filter web build",
    "build:api": "pnpm --filter api build",
    "build:worker": "pnpm --filter worker build",
    "lint": "pnpm -r lint",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "typecheck": "pnpm -r typecheck",
    "test": "pnpm -r test",
    "test:unit": "pnpm -r test:unit",
    "test:e2e": "pnpm -r test:e2e",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:migrate:generate": "pnpm --filter api db:migrate:generate",
    "db:seed": "pnpm --filter api db:seed",
    "worker": "pnpm --filter worker dev",
  },
}
```

Rationale:

- pnpm instead of Turbo in the first pass keeps Phase 0 dependency-light; Turborepo
  may be added later if measured caching gains justify it (`turbo.json` is referenced
  but optional).
- All commands map to the `AGENTS.md` post-task gates: format → lint → typecheck →
  unit → integration → e2e.

---

# 8. Testing Strategy

## 8.1 Framework Choices

| Layer                    | Tool                                                                |
| ------------------------ | ------------------------------------------------------------------- |
| Unit (web)               | `vitest`                                                            |
| Unit (api/worker/shared) | `vitest` (or jest; unified on vitest to reduce config)              |
| Integration              | `supertest` + running PostgreSQL/Redis in Testcontainers or Compose |
| E2E                      | `playwright` (web flows) + API e2e via `supertest`                  |

Unified choice: **Vitest** (no Jest transform/babel overhead on modern Node; both
README-listed frameworks are permitted). Confirmed during Phase 0.

## 8.2 Coverage Targets by Layer

**Frontend:** component rendering, TanStack Query hooks (mocked API), route guards.
**Backend:** DTO validation, guards, service unit tests, config validation failures.
**Shared packages:** every utility; **financial/decimal functions are mandatory.**
**Database:** migrations run against a clean DB; seed idempotency.
**Workers:** job enqueue→process round-trip on real Redis; failure/retry paths.
**Trading engine (later):** strategy→signal→risk→order pipeline.
**Risk engine (later):** deterministic approval/rejection matrices, position sizing, circuit breaker.
**Broker adapters (later):** contract tests against the generic interface; Bybit
localhost/mocked fixtures, never production credentials.

## 8.3 Phase 0 Deliverable Tests

Unit + integration for: config validation, health checks, decimal utility,
shared types/enums, a smoke BullMQ round-trip, and a DB connectivity test.
E2E: staged next phase; Phase 0 establishes the harness and one web "app loads" check.

## 8.4 Test Safety Rules

- Tests never hit live Bybit.
- Test fixtures never contain production credentials.
- Test databases are isolated and disposable (per-run databases or schema).
- Financial tests assert exact decimal results, not float approximations.

---

# 9. Security Strategy

## 9.1 Secrets

- `.env` git-ignored; `.env.example` placeholders only.
- No keys/passwords in source, tests, or fixtures.
- Config schema validation fails fast on missing secrets in non-dev envs.

## 9.2 Authentication / Authorization (Phase 1+)

- Password hashing (argon2/bcrypt), JWT access + refresh, session revocation.
- Role-based guards (`USER`, `ADMIN`, `SUPER_ADMIN`).
- Every protected route validates server-side; client-supplied IDs never trusted.

## 9.3 Bybit Credentials (Phase 8+)

- Server-side environment variables only.
- Stored/decrypted via `ENCRYPTION_KEY` where persistence in DB is required.
- Never returned through API responses; never in logs.

## 9.4 Application Defense

- Input validation (DTO + class-validator) everywhere.
- Rate limiting on sensitive endpoints (throttler).
- Helmet/CORS hardening for the API.
- Structured logs that exclude secrets; audit log table for privileged/financial events.
- Dependency vulnerability scanning (`pnpm audit`) in CI.

---

# 10. Trading Safety Strategy

## 10.1 Mandatory Pipeline

```text
Strategy
    ↓ (signal only: BUY / SELL / HOLD + metadata)
Signal
    ↓
Risk Engine            → APPROVED or REJECTED(reason) — deterministic and logged
    ↓
Order Manager          → idempotency key + explicit state machine
    ↓
Broker Adapter         → PaperBroker / BybitAdapter (never mixed)
    ↓
Broker/Exchange
```

## 10.2 Why This Separation Is Mandatory

1. **Correctness:** each stage is independently testable; bugs can't hide behind a
   single monolithic "strategy" that also executes.
2. **Safety:** risk can veto any signal before money moves; a buggy strategy cannot
   reach a broker.
3. **Auditability:** signal → risk verdict → order lifecycle → trade → position is a
   complete, immutable trail.
4. **Extensibility:** new strategies, markets, and brokers plug in without touching
   execution or risk.

## 10.3 Phase 0 Safety Implementation

- Broker interface stub + forbidden-pattern documentation (no execution exists yet).
- `packages/shared` decimal financial utilities + tests.
- No orders, positions, balances, or fake broker behavior anywhere in Phase 0.

## 10.4 Order Lifecycle (design contract, enforced from Phase 4+)

```text
CREATED → SUBMITTED → ACCEPTED → PARTIALLY_FILLED → FILLED
                            ↘ CANCELLED | REJECTED | FAILED
```

Transitions validated; each recorded. Local state is never assumed correct —
exchange state + reconciliation are authoritative for live trading.

---

# 11. Phase Roadmap

Each phase lists objective, major modules, dependencies, risks, deliverables, tests.

> Phases 1–11 are planning-level. Phase 0 is the only executable scope until approval.

---

## Phase 0 — Foundation

**Objective:** reliable, secure, testable scaffolding for every later feature.

**Major modules:**

- pnpm monorepo (apps/web, apps/api, apps/worker; packages/shared)
- NestJS API with `/api/health`, `/api/ready`, config validation, structured logs
- Next.js app (App Router, Tailwind, shadcn/ui base, TanStack Query client)
- Worker process with BullMQ + Redis round-trip
- PostgreSQL connection via ORM + initial migration (users not yet required → minimal schema or none)
- Docker Compose (web, api, worker, postgres, redis) — needs Docker or approved fallback
- ESLint/Prettier/TS base config, Vitest harness, Git init, `.env.example`, docs

**Dependencies:** Node 24, pnpm 11.15, Postgres 16, Redis 7, TypeScript, framework deps (§4). Docker install required (or fallback, §12).

**Risks:**

- Docker not installed locally → unverifiable Compose (mitigate: §6.4 decision).
- Windows dev environment quirks (line endings, package scripts) → `.editorconfig`, cross-platform scripts.
- Framework/config churn between latest majors → pin exact versions at install.
- ORM choice (TypeORM vs Prisma) affects later phases → decide in §12.

**Deliverables:** working monorepo, all three apps start, health checks green, DB+Redis connect, BullMQ smoke job, lint/format/typecheck/test pass, docs updated, zero secrets committed, zero trading logic.

**Tests:** config validation; health/ready endpoints; decimal utility suite; BullMQ round-trip on real Redis; DB connectivity; one web smoke check.

---

## Phase 1 — Authentication & Users

**Objective:** secure identity and authorization foundation.

**Major modules:** `users`, `auth` (register/login/logout/tokens/password reset),
sessions, role guards, protected routes, `/login`, `/register`, `/dashboard` shell.

**Dependencies:** Phase 0; JWT + password-hashing libs; User/audit tables via
migrations.

**Risks:** token/session security flaws; rate-limit/brute-force exposure; broken
protected-route coverage.

**Deliverables:** user can register → login → reach dashboard → logout (server-verified).

**Tests:** registration (incl. duplicate email), login (valid/invalid), session
expiry, protected-route authorization matrix, rate limiting, migration correctness.

---

## Phase 2 — Market Data

**Objective:** normalized market data independent of any exchange.

**Major modules:** `markets`, `assets`, `candles` (1m/5m/15m/1h/4h/1d), market-data
adapter abstraction, normalization, basic chart UI, `/markets/[symbol]`.

**Dependencies:** Phase 1 (auth-guarded access); Postgres candle storage; optional
Redis cache.

**Risks:** unbounded candle storage; timezone/timestamp drift; rate-limit behavior on
public providers.

**Deliverables:** platform fetches and serves normalized candles for a small symbol
list (BTCUSDT/ETHUSDT/SOLUSDT); chart renders; no trading.

**Tests:** parsers/normalizers, invalid/missing/duplicate candles, symbol validation,
history pagination, chart component.

---

## Phase 3 — Strategy Engine

**Objective:** modular, versioned strategies that emit signals only.

**Major modules:** `strategies`, `signals`, `indicators` package (MA, RSI, breakout),
strategy registry + versioning, configuration validation.

**Dependencies:** Phases 0–2; indicator library; Strategy/StrategyVersion/Signal tables.

**Risks:** look-ahead bugs in indicator order; non-deterministic signals; unbounded
strategy config; strategy silently bypassing risk — architecturally prevented.

**Deliverables:** strategies compute deterministic signals from market data; no order
execution path exists.

**Tests:** indicator correctness, crossover/RSI/breakout behavior, config validation,
edge cases (insufficient data), signal determinism.

---

## Phase 4 — Backtesting

**Objective:** realistic, reproducible historical evaluation.

**Major modules:** `backtesting` package (replay + sim execution), fees, slippage,
position handling, metrics (profit factor, max drawdown, Sharpe, win rate), Backtest/
BacktestTrade/BacktestEquityPoint storage, `/backtests` UI.

**Dependencies:** Phases 2–3; historical data availability.

**Risks:** look-ahead bias/future leakage; unrealistic fills; incorrect P&L; metric
fabrication (invalid metrics → null, not invented).

**Deliverables:** strategy backtested against history with fee/slippage-adjusted
results and stored reports.

**Tests:** replay correctness, no-look-ahead property tests, fill modeling, fee/
slippage math, P&L/equity/drawdown calculations, result reproducibility.

---

## Phase 5 — Risk Engine

**Objective:** independent enforcement layer that can veto any order.

**Major modules:** `risk-engine` package: max risk/trade, position sizing, max daily
loss, exposure, max positions, stop-loss/take-profit requirements, drawdown limits,
symbol/session restrictions, circuit breaker (strategy/bot/account/global severities).

**Dependencies:** Phases 0–4; RiskRule + AuditLog tables.

**Risks:** float misuse in position sizing (mitigated by decimal utilities);
automated resume after critical events (denied by default); risk checks being
bypassed (architecturally prevented).

**Deliverables:** every signal passes through deterministic risk checks; rejections
logged with reasons; circuit breaker halts new orders.

**Tests:** approval/rejection matrix per rule, position sizing math, daily-loss and
drawdown triggers, circuit-breaker states, no-bypass integration test.

---

## Phase 6 — Paper Trading

**Objective:** full simulated account workflow using the same abstractions as live.

**Major modules:** `paper` broker adapter, paper accounts/orders/positions/portfolio,
simulated fills from market data, paper P&L, `/portfolio`, `/positions`, `/orders`.

**Dependencies:** Phases 0–5; PaperBroker implementing the generic broker interface.

**Risks:** paper/live state mixing (prevented by strict mode separation);
unrealistic paper fills; drift between backtest and paper behavior.

**Deliverables:** a strategy runs continuously on a paper account with no real funds.

**Tests:** paper fill logic, balance/position/P&L updates, order lifecycle in paper,
PaperBroker contract conformance to the generic broker interface.

---

## Phase 7 — Bot Engine

**Objective:** turn strategies into controllable, monitored automated bots.

**Major modules:** `bots`, `bot-runs`, bot lifecycle states
(DRAFT→STARTING→RUNNING→PAUSED→STOPPING→STOPPED/ERROR), execution modes
(BACKTEST/PAPER/DEMO/TESTNET/LIVE), queues + worker processors, start/stop/pause,
monitoring UI, `/bots`.

**Dependencies:** Phases 0–6; BullMQ workers; Bot/BotRun tables.

**Risks:** bots reporting RUNNING without verification; crashes mid-cycle causing
duplicate signals/orders; runaway loops (mitigated by risk + circuit breaker +
idempotency).

**Deliverables:** a paper bot runs continuously, logs signals, survives failures into
ERROR (never silently continues), and honors stop/pause.

**Tests:** lifecycle transitions, worker queue round-trips, start/stop idempotency,
crash-recovery behavior, monitoring data accuracy.

---

## Phase 8 — Bybit Demo / Testnet

**Objective:** first real exchange integration through the broker abstraction,
non-live only.

**Major modules:** `broker-adapters/bybit` (REST client, WebSocket, adapter, mappers,
errors, types), Bybit credentials handling, order placement/cancel/query, account/
balance/positions sync, order-event processing, reconciliation.

**Dependencies:** Phases 0–7; BYBIT_API_KEY/SECRET/ENVIRONMENT for demo/testnet only.

**Risks:** accidental live routing (mitigated by strict environment flag + no live
credentials in test); wrong assumptions about fill state (order state from exchange
responses/events, never assumed); rate limits; reconciliation gaps.

**Deliverables:** platform executes and reconciles orders against non-live Bybit via
the generic broker interface.

**Tests:** adapter contract tests, REST/WS mapping, order-state transitions from real
responses, cancellation, balance/position sync, reconciliation diff detection,
environment-mismatch guard tests.

---

## Phase 9 — Live Trading

**Objective:** controlled real-money trading with maximal safeguards.

**Major modules:** explicit live mode + separate credentials, strict risk limits,
circuit breakers, order/position reconciliation, audit logging, monitoring,
emergency stop (cancel eligible orders, pause bots).

**Dependencies:** Phases 0–8 verified stable; explicit operator approval.

**Risks:** financial loss; duplicate orders (idempotency); state divergence
(reconciliation); emergency-stop failure; automated resume after critical events.
**Must not** begin until paper + demo/testnet are proven.

**Deliverables:** a controlled live bot trades small sizes under full risk,
reconciliation, and audit supervision.

**Tests:** every Phase 5 risk rule in live path; reconciliation failure → halt
integration test; idempotency under retries; emergency-stop drill; authorization
guard tests.

---

## Phase 10 — Portfolio & Analytics

**Objective:** exact performance insight at portfolio/strategy/bot level.

**Major modules:** `portfolio`, `analytics`, `positions`, portfolio snapshots,
performance metrics, equity/drawdown charts, `/analytics`, widget dashboard.

**Dependencies:** Phases 0–6+; PortfolioSnapshot + analytics queries.

**Risks:** inaccurate P&L (decimal discipline), snapshot gaps, runaway analytics jobs.

**Deliverables:** users see precise portfolio, strategy, trade, and bot performance.

**Tests:** P&L aggregation, snapshot integrity, drawdown/Sharpe correctness,
report determinism.

---

## Phase 11 — AI Features

**Objective:** AI assistance that never bypasses deterministic controls.

**Major modules:** `ai` module: strategy generation/explanation, backtest analysis,
performance analysis, research assistant; `ai-processing` queue.

**Dependencies:** Phases 0–10 stable; AI_API_KEY placeholder; validation + approval
pipeline.

**Risks:** AI bypassing risk/execution (architecturally prevented); non-deterministic
outputs; prompt injection; over-automation.

**Deliverables:** AI proposes and explains strategies that pass validation →
backtest → risk review → user approvals; it cannot place orders.

**Tests:** proposal validation, approval-gate enforcement, output safety, pipeline
no-bypass tests.

---

# 12. Risks / Questions Requiring Approval Before Phase 0

1. **Docker availability** — Docker is not installed. Install Docker Desktop /
   Rancher Desktop, or approve the non-Docker local fallback (`scripts/dev.sh` +
   local Postgres/Redis) with Compose authored but verified later?
2. **ORM choice** — TypeORM (tight @nestjs/typeorm integration, mature migrations)
   or Prisma (schema-first, excellent DX)? README permits both. **Recommend TypeORM**
   for NestJS-native lifecycle and entity integration, but Prisma is acceptable if preferred.
3. **Package scaffolding for empty packages** — create stub `packages/indicators`,
   `backtesting`, `risk-engine`, `broker-adapters` now for structural stability, or
   defer until their phases (smaller Phase 0)?
4. **Package manager script tooling** — plain pnpm `--filter`/`--recursive` scripts
   (Phase 0) vs adding Turborepo now. Recommend pnpm-only until caching is needed.
5. **Test framework unification** — Vitest across web/api/worker/shared. Acceptable,
   or prefer Jest for any layer?
6. **Git initialization** — repo is not yet a git repository; initialize with
   `git init` + meaningful initial commit as part of Phase 0?
7. **CI** — include a minimal GitHub Actions workflow in Phase 0, or defer?
8. **Schema scope in Phase 0** — Phase 0 database contains migrations only for a
   minimal need (e.g., a `health`/`meta` table) or zero application tables until Phase 1?

---

# 13. First Implementation Task

After approval, the safest first implementation task is:

> **Initialize the Trading Bolt monorepo foundation and verify it end-to-end on this
> machine, building no trading functionality.**

Concrete (recommended) order:

1. `git init`, root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`,
   `.gitignore`, `.editorconfig`, `.env.example`, base ESLint/Prettier configs.
2. Scaffold `packages/shared` (types, enums, `decimal-` utils) with Vitest tests.
3. Scaffold `apps/api` (NestJS): config validation, `/api/health`, `/api/ready`,
   structured logging, DB+Redis connectivity, minimal BullMQ wiring.
4. Scaffold `apps/worker`: consume a smoke queue job and round-trip it.
5. Scaffold `apps/web` (Next.js): Tailwind, shadcn/ui, TanStack Query provider,
   health display only; one smoke test.
6. Author `docker/` + `docker-compose.yml` (and/or `scripts/dev.sh` per §12#1).
7. Add CI (per §12#7), update docs.
8. Run the full gate: `format:check` → `lint` → `typecheck` → `test` → (integration).

Scope exclusions in this task: no auth, no markets, no strategies, no backtesting,
no risk, no bots, no Bybit, no mock trading, no Python.
Zero secrets committed. No claim of "everything works" without actual verification.

---

# 14. Phase 0 — Implementation Status (2026-09-13)

## Completed

- `git init` on branch `main`; root `package.json`, `pnpm-workspace.yaml`,
  `.npmrc`, `.gitignore`, `.editorconfig`, `.prettierrc`, `.prettierignore`,
  `.dockerignore`, `tsconfig.base.json`, `.env.example`.
- `packages/shared` — enums, constants (queue names), health types, decimal
  financial utilities. 12 unit tests.
- `apps/api` (NestJS 12, ESM) — zod env validation, JSON structured logging,
  `/api/health` + `/api/ready`, TypeORM (PostgreSQL), ioredis client, BullMQ
  smoke queue, migration pipeline via `src/database/*` (tsx). 14 unit tests.
- `apps/worker` (BullMQ) — consumes the `smoke` queue with structured logs,
  graceful shutdown.
- `apps/web` (Next.js 16) — TanStack Query provider, `cn` util, health status
  page polling `/api/health` and `/api/ready`.
- `docker-compose.yml`, per-app `Dockerfile`s, `scripts/dev.sh` fallback,
  `.github/workflows/ci.yml`.
- Stub packages for `trading-engine`, `indicators`, `backtesting`, `risk-engine`,
  `broker-adapters` (build/typecheck only, no logic).

## Verified on this machine

- `pnpm format:check` — pass
- `pnpm lint` — pass (all packages/apps)
- `pnpm typecheck` — pass (all packages/apps)
- `pnpm test` — pass (shared 12, api 14)
- `pnpm build` — pass (shared, api nest build, worker tsc, web next build)
- API bootstrap smoke test — DI graph resolves end-to-end; process fails only
  at the expected `ECONNREFUSED` for missing Postgres/Redis, confirming config
  validation, logger, and module wiring.

## Not yet verified (requires PostgreSQL/Redis/Docker)

- `pnpm db:migrate` and `pnpm db:seed` against a real PostgreSQL instance.
- `pnpm test:e2e` API e2e suite (needs DB + Redis).
- Smoke job round-trip (api → redis queue → worker).
- `docker compose build/up` (Docker not installed on this machine).
- CI workflow execution on GitHub.

## Decision outcomes (from §12)

| #   | Question            | Decision                                                                       |
| --- | ------------------- | ------------------------------------------------------------------------------ |
| 1   | Docker availability | Compose authored; non-Docker fallback `scripts/dev.sh`; Compose verified later |
| 2   | ORM                 | TypeORM                                                                        |
| 3   | Stub packages       | Create now                                                                     |
| 4   | Script tooling      | Plain pnpm filters (no Turborepo)                                              |
| 5   | Test framework      | Vitest everywhere                                                              |
| 6   | Git init            | Done                                                                           |
| 7   | CI                  | Minimal GitHub Actions workflow                                                |
| 8   | Schema scope        | Single `app_meta` table only                                                   |

## Next step

Run Phase 0's pending verification once a PostgreSQL + Redis environment exists
(start the existing containers or CI), confirm `db:migrate`/`db:seed`/e2e and a
smoke queue round-trip, then begin Phase 1 (Authentication).

---

**END OF PHASE 0 IMPLEMENTATION PLAN**
