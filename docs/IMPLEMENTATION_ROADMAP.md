# TRADING BOLT

# COMPLETE IMPLEMENTATION ROADMAP

**Project:** Trading Bolt
**Purpose:** Algorithmic Cryptocurrency Trading Platform
**Primary Exchange:** Binance (Testnet for development) — Bybit as secondary/fallback
**Primary Language:** TypeScript
**Backend:** NestJS + Node.js
**Frontend:** Next.js + React
**Database:** PostgreSQL
**Cache/Queues:** Redis + BullMQ
**Containerization:** Docker
**Status:** Development Roadmap

> **Implementation status (2026-09-13)** — maintained alongside
> `docs/PHASE_0_IMPLEMENTATION_PLAN.md`, which tracks per-step detail and
> per-phase verification gates.
>
> - **Phase 0 Foundation** — implemented & unit-verified.
> - **Phase 1 Auth & Users** — implemented & unit-verified (live-service items
>   still pending DB/Redis/Docker).
> - **Phase 2 Market Data** — implemented & unit-verified.
> - **Phase 3 Strategy Engine** — implemented & unit-verified.
> - **Phase 4 Backtesting** — implemented & unit-verified (steps A–D: engine,
>   sizing/shorts/metrics, persistence, API + `/backtests` UI).
> - **Phase 5 Risk Engine** — implemented & unit-verified (`@trading-bolt/risk-engine`:
>   decimal-exact position sizing, 14-rule deterministic decision matrix + `reduce-only`
>   exit validation, circuit breaker severities, session/symbol/side restrictions;
>   runtime wiring into live account/order state deferred to Phase 6+).
> - **Phase 6 Paper Trading** — implemented & unit-verified (steps A–D:
>   `@trading-bolt/broker-adapters` — async `BrokerAdapter` abstraction + deterministic
>   `PaperBroker` with full §15 lifecycle; risk-gated paper ledger API — accounts,
>   orders (market/limit, idempotency), positions, portfolio snapshots; `/paper/*`
>   endpoints under JWT. Phase 7 bot engine adds the continuous strategy loop and
>   resting-limit-fill ticks).
> - **Phase 7 Bot Engine** — implemented & unit-verified in code (2026-09-15);
>   _not yet fully documented in this roadmap or integration-tested against
>   Postgres/Redis_. Includes: explicit bot lifecycle state machine, BullMQ
>   scheduling + execution processor, bot runner cycle
>   (settle limits → candles → strategy → signal → risk-gated paper order with
>   the bot's own validated `riskConfig`, AGENTS.md §18), bot/bot_runs entities
>   - migration, CRUD/lifecycle/monitor API, resting-limit-order settlement,
>     and the `/bots` create/lifecycle/monitor UI page.
>     Remaining gaps: no Docker-backed integration tests, bot cycle counters only
>     (no per-signal persistence yet).

---

# 1. PURPOSE OF THIS DOCUMENT

This document defines the complete implementation roadmap for Trading Bolt.

It explains:

- What should be built
- In what order it should be built
- Why each phase exists
- What each phase depends on
- What must be tested
- What must NOT be built yet
- When Bybit should be connected
- When paper trading should begin
- When live trading can eventually be enabled
- When AI features should be introduced

This document must be used together with:

```text
README.md
AGENTS.md
```

Priority:

```text
AGENTS.md
    ↓
README.md
    ↓
IMPLEMENTATION_ROADMAP.md
```

If a conflict exists, stop and follow the higher-priority project rules rather than making assumptions.

---

# 2. CORE DEVELOPMENT PRINCIPLE

Trading Bolt is financial software.

The system must be built incrementally.

Never attempt to build the entire trading platform in one implementation task.

The development progression is:

```text
Foundation
    ↓
Authentication
    ↓
Market Data
    ↓
Strategy Engine
    ↓
Backtesting
    ↓
Risk Engine
    ↓
Paper Trading
    ↓
Bot Engine
    ↓
Binance Testnet / Bybit Demo-Testnet
    ↓
Live Trading
    ↓
Analytics
    ↓
AI
```

The system must always move through:

```text
Backtest
   ↓
Paper Trade
   ↓
Demo/Testnet
   ↓
Controlled Live
   ↓
Production Live
```

---

# 3. HIGH-LEVEL ARCHITECTURE

```text
                         TRADING BOLT
                              │
                ┌─────────────┴─────────────┐
                │                           │
             FRONTEND                    BACKEND
             Next.js                    NestJS
                │                           │
                │                    ┌──────┴──────┐
                │                    │             │
                │               Application    Trading
                │                  Services     Engine
                │                    │             │
                │                    │        ┌────┴────┐
                │                    │        │         │
                │                    │      Risk      Strategy
                │                    │     Engine      Engine
                │                    │        │
                │                    │    Order Manager
                │                    │        │
                │                    │   Broker Adapter
                │                    │        │
                │                    │    Bybit Adapter
                │                    │        │
                │                    │      BYBIT
                │                    │
                └────────────────────┤
                                     │
                              PostgreSQL
                                     │
                                  Redis
                                     │
                                  BullMQ
                                     │
                                  Worker
```

---

# 4. PHASE OVERVIEW

Trading Bolt will be implemented through the following phases:

```text
PHASE 0   Foundation
PHASE 1   Authentication & Users
PHASE 2   Market Data Infrastructure
PHASE 3   Strategy Engine
PHASE 4   Backtesting Engine
PHASE 5   Risk Management Engine
PHASE 6   Paper Trading
PHASE 7   Bot Engine
PHASE 8   Broker Integration (Binance primary, Bybit secondary)
PHASE 9   Live Trading
PHASE 10  Portfolio & Analytics
PHASE 11  Notifications & Monitoring
PHASE 12  AI Features
PHASE 13  Production Hardening
```

---

# PHASE 0 — FOUNDATION

## Objective

Create the reliable technical foundation required by every future feature.

## Build

### Monorepo

```text
apps/
  web/
  api/
  worker/

packages/
  shared/
  trading-engine/
  indicators/
  backtesting/
  risk-engine/
  broker-adapters/
    bybit/
```

### Frontend

Set up:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- charting infrastructure

### Backend

Set up:

- NestJS
- TypeScript
- API architecture
- configuration management
- validation
- logging
- health checks

### Infrastructure

Set up:

- PostgreSQL
- Redis
- BullMQ
- Docker
- Docker Compose

### Developer tooling

Set up:

- ESLint
- Prettier
- TypeScript checks
- testing framework
- Git hooks where appropriate

## Do NOT build

- Trading
- Strategies
- Live Bybit
- AI
- Backtesting
- Bots

## Definition of Done

```text
Frontend starts
API starts
Worker starts
PostgreSQL works
Redis works
BullMQ works
Docker works
Tests run
TypeScript passes
Lint passes
```

---

# PHASE 1 — AUTHENTICATION & USERS

## Objective

Create a secure user system.

## Build

### User

```text
User
```

Fields should eventually include:

- id
- name
- email
- password hash
- role
- status
- timestamps

## Authentication

Implement:

- Registration
- Login
- Logout
- Session/token management
- Password hashing
- Password validation
- Protected routes
- Authentication guards

## Authorization

Support roles where required.

Example:

```text
USER
ADMIN
```

Do not over-engineer roles initially.

## Security

Implement:

- Input validation
- Rate limiting
- Secure cookies/tokens
- Password hashing
- Session security
- Authorization checks

## Frontend

Create:

```text
/login
/register
/forgot-password
/dashboard
```

## Tests

Test:

- Registration
- Login
- Invalid credentials
- Duplicate email
- Protected routes
- Authorization

## Definition of Done

A user can:

```text
Register
   ↓
Login
   ↓
Access Dashboard
   ↓
Logout
```

---

# PHASE 2 — MARKET DATA INFRASTRUCTURE

## Objective

Create a reliable market-data system before creating trading strategies.

The strategy engine must not depend directly on raw Bybit API responses.

---

## Architecture

```text
Bybit
  ↓
Market Data Adapter
  ↓
Normalizer
  ↓
Market Data Service
  ↓
PostgreSQL / Redis
  ↓
Strategy Engine
```

---

# Market Data Models

Eventually support:

```text
Asset
Market
Candle
Ticker
Trade
OrderBook
FundingRate
```

---

# Initial Markets

Start with a small controlled list.

Example:

```text
BTCUSDT
ETHUSDT
SOLUSDT
```

Do not immediately support hundreds of markets.

---

# Candle Data

Support:

```text
1m
5m
15m
1h
4h
1d
```

Only implement intervals actually required by the initial strategies.

---

# Bybit Public Data

Initially use Bybit public market data only.

Do not connect user trading credentials yet.

Eventually support:

- REST market data
- WebSocket market data
- Candles
- Tickers
- Trades
- Order book
- Instrument information
- Funding data where applicable

---

# Data Normalization

Convert exchange-specific responses into internal types.

Example:

```typescript
interface Candle {
  symbol: string;
  timestamp: number;
  open: Decimal;
  high: Decimal;
  low: Decimal;
  close: Decimal;
  volume: Decimal;
}
```

The strategy engine should use internal models rather than Bybit response structures.

---

# Tests

Test:

- Data parsing
- Data normalization
- Invalid data
- Missing candles
- Duplicate candles
- WebSocket reconnect
- REST failures
- Rate limits

---

# Definition of Done

Trading Bolt can reliably obtain normalized market data without strategy or trading logic.

---

# PHASE 3 — STRATEGY ENGINE

## Objective

Create a modular strategy framework.

---

# Core Architecture

```text
Market Data
     ↓
Indicators
     ↓
Strategy
     ↓
Signal
```

A strategy must NEVER directly submit an order.

---

# Strategy Interface

Conceptually:

```typescript
interface Strategy {
  name: string;

  initialize(): Promise<void>;

  onMarketData(data: MarketData): Promise<Signal | null>;

  validateConfiguration(config: unknown): void;
}
```

The exact interface can evolve during implementation.

---

# Initial Strategies

Implement only a few simple strategies.

## 1. Moving Average Crossover

Example:

```text
EMA 20
EMA 50
```

Signal:

```text
EMA20 crosses above EMA50
→ BUY

EMA20 crosses below EMA50
→ SELL
```

---

## 2. RSI Strategy

Example:

```text
RSI < 30
→ potential BUY

RSI > 70
→ potential SELL
```

These thresholds are configurable.

---

## 3. Breakout Strategy

Detect price breaking a defined high/low range.

---

# Signals

Signals should contain information such as:

```text
strategy
symbol
side
timestamp
price
confidence if applicable
metadata
```

A signal is NOT an order.

---

# Strategy Versioning

Strategies should be versioned.

Example:

```text
RSI Strategy
  v1
  v2
  v3
```

This is important for reproducing historical backtests.

---

# Tests

Test:

- Indicators
- Strategy calculations
- Signal generation
- Configuration validation
- Edge cases
- Missing market data

---

# Definition of Done

Trading Bolt can:

```text
Receive Market Data
       ↓
Calculate Indicators
       ↓
Run Strategy
       ↓
Generate Signal
```

No real orders are placed.

---

# PHASE 4 — BACKTESTING ENGINE

## Objective

Determine how strategies would have performed historically.

---

# Architecture

```text
Historical Data
      ↓
Backtest Engine
      ↓
Strategy
      ↓
Signals
      ↓
Risk Rules
      ↓
Simulated Orders
      ↓
Positions
      ↓
Performance Metrics
```

---

# Backtest Requirements

The engine must account for:

- Entry price
- Exit price
- Fees
- Slippage
- Position size
- Stop loss
- Take profit
- Available capital
- Trading constraints

---

# Critical Rules

Avoid:

### Look-ahead bias

The strategy must never see future information.

### Data leakage

Future candles must never influence past decisions.

### Unrealistic execution

Do not assume every order fills perfectly at the desired price.

---

# Metrics

Support:

```text
Initial Capital
Final Capital
Net Profit
ROI
Total Trades
Winning Trades
Losing Trades
Win Rate
Profit Factor
Maximum Drawdown
Sharpe Ratio
Average Trade
Average Win
Average Loss
```

Metrics must only be displayed when correctly calculated.

---

# Backtest Results

Store:

```text
Backtest
BacktestTrade
BacktestEquityPoint
```

---

# Frontend

Create:

```text
/backtests
/backtests/:id
```

Show:

- Equity curve
- Drawdown
- Trade list
- Metrics
- Strategy configuration
- Date range
- Market
- Timeframe

---

# Definition of Done

A strategy can be tested against historical data and produce reproducible results.

---

# PHASE 5 — RISK MANAGEMENT ENGINE

## Objective

Create an independent risk layer that controls trading exposure.

This is one of the most important parts of Trading Bolt.

---

# Architecture

```text
Signal
   ↓
Risk Engine
   ↓
APPROVED / REJECTED
   ↓
Order Manager
```

---

# Risk Rules

Initially support:

- Maximum risk per trade
- Maximum position size
- Maximum exposure
- Maximum daily loss
- Maximum open positions
- Maximum drawdown
- Stop loss
- Take profit
- Circuit breaker

---

# Position Sizing

Example:

```text
Account = $1,000

Risk = 1%

Maximum allowed loss = $10
```

Position size must be calculated from the actual stop-loss distance and instrument constraints.

Do not use careless JavaScript floating-point calculations for financial values.

Use a proper decimal/money representation.

---

# Circuit Breaker

Example conditions:

```text
Daily loss > configured limit
        ↓
STOP NEW TRADES
```

or:

```text
Broker connection unstable
        ↓
PAUSE TRADING
```

or:

```text
Reconciliation failure
        ↓
PAUSE TRADING
```

---

# Risk Decision

The engine should produce something conceptually like:

```text
APPROVED
```

or:

```text
REJECTED
```

with a reason.

Example:

```text
REJECTED

Reason:
Maximum daily loss exceeded.
```

---

# Tests

Risk management requires extensive unit tests.

Test:

- Position sizing
- Stop loss
- Take profit
- Exposure
- Daily loss
- Maximum positions
- Drawdown
- Circuit breaker
- Invalid orders
- Edge cases

---

# Definition of Done

No future trading order can bypass the risk engine.

---

# PHASE 6 — PAPER TRADING

## Objective

Build Trading Bolt's internal trading simulator.

This is NOT Bybit.

---

# Architecture

```text
Strategy
   ↓
Signal
   ↓
Risk Engine
   ↓
Paper Order Manager
   ↓
Paper Execution Engine
   ↓
Paper Position
   ↓
Paper Portfolio
```

---

# Paper Account

Users should be able to create simulated accounts.

Example:

```text
Starting Balance
$10,000
```

---

# Paper Orders

Support:

```text
Market
Limit
Stop
Take Profit
```

Only implement order types actually required by the MVP.

---

# Paper Positions

Track:

- Entry price
- Quantity
- Current price
- Unrealized P&L
- Realized P&L
- Fees
- Stop loss
- Take profit

---

# Paper Trading Dashboard

Show:

- Balance
- Equity
- Open positions
- Orders
- Trades
- P&L
- Drawdown
- Bot status

---

# Definition of Done

A complete strategy can operate continuously in paper trading without touching real exchange funds.

---

# PHASE 7 — BOT ENGINE

## Objective

Turn strategies into controllable automated trading bots.

---

# Bot Lifecycle

Use explicit states:

```text
DRAFT
STOPPED
STARTING
RUNNING
PAUSED
STOPPING
ERROR
```

---

# Bot Structure

A bot should reference:

```text
Strategy
StrategyVersion
Market
Timeframe
RiskConfiguration
TradingAccount
ExecutionMode
```

---

# Execution Modes

Support:

```text
BACKTEST
PAPER
DEMO
TESTNET
LIVE
```

The execution mode must be explicit.

A paper bot must NEVER accidentally use live credentials.

---

# Bot Engine

Conceptually:

```text
Bot
 ↓
Market Data
 ↓
Strategy
 ↓
Signal
 ↓
Risk
 ↓
Order Manager
 ↓
Execution
```

---

# Bot Controls

Users should eventually be able to:

```text
Start
Stop
Pause
Resume
```

---

# Bot Monitoring

Show:

- Status
- Runtime
- Strategy
- Market
- Current position
- P&L
- Last signal
- Last order
- Errors

---

# Failure Handling

If the bot encounters serious failures:

```text
RUNNING
   ↓
ERROR
```

or:

```text
RUNNING
   ↓
PAUSED
```

depending on the failure.

Do not silently continue after critical financial errors.

---

# Definition of Done

A paper bot can run continuously and safely execute the configured strategy through the paper execution engine.

---

# PHASE 8 — BYBIT INTEGRATION

## Objective

Connect Trading Bolt to Bybit through a controlled broker abstraction.

This is the first point where Trading Bolt begins interacting with an external exchange for execution.

---

# Broker Architecture

```text
BrokerAdapter
     │
     └── BybitAdapter
```

---

# Bybit Adapter

Create a dedicated module.

Conceptually:

```text
packages/
└── broker-adapters/
    └── bybit/
        ├── client
        ├── rest
        ├── websocket
        ├── adapter
        ├── mapper
        ├── errors
        └── types
```

Exact filenames can be determined during implementation.

---

# Adapter Responsibilities

Eventually support:

```text
getAccountBalance()
getMarketPrice()
getSymbols()
getOpenOrders()
getOrder()
placeOrder()
cancelOrder()
getPositions()
```

Additional methods may be added as required.

---

# REST

Use REST for appropriate operations such as:

- Account information
- Order placement
- Order cancellation
- Order retrieval
- Position retrieval
- Instrument information

---

# WebSocket

Use WebSockets where appropriate for:

- Market data
- Order updates
- Execution updates
- Position updates
- Account updates

---

# Authentication

Bybit credentials must exist only on the backend.

Example:

```env
BYBIT_API_KEY=
BYBIT_API_SECRET=
BYBIT_ENVIRONMENT=demo
```

Never expose them to:

```text
React
Next.js client components
Browser
Public API response
Logs
Git
```

---

# Bybit Environment

Start with:

```text
DEMO
```

or an appropriate test environment.

Do NOT immediately connect live accounts.

---

# Reconciliation

Compare:

```text
Trading Bolt
     ↕
Bybit
```

for:

- Orders
- Positions
- Balances

---

# Order Lifecycle

Support:

```text
CREATED
SUBMITTED
ACCEPTED
PARTIALLY_FILLED
FILLED
CANCELLED
REJECTED
FAILED
```

Actual exchange responses must determine state.

---

# Idempotency

Prevent duplicate orders caused by:

- Retries
- Worker restarts
- Network failures
- Duplicate messages
- API timeouts

---

# Definition of Done

Trading Bolt can safely communicate with Bybit's non-live environment through the generic broker interface.

---

# PHASE 9 — LIVE TRADING

## Objective

Enable controlled real-money trading.

This phase should only begin after:

```text
Backtesting
+
Paper Trading
+
Bybit Demo/Testnet
+
Risk Engine
+
Reconciliation
+
Extensive Testing
```

are proven stable.

---

# Live Trading Requirements

Before enabling live trading:

- Explicit live mode
- Separate credentials
- Risk limits
- Circuit breakers
- Order reconciliation
- Position reconciliation
- Audit logs
- Error handling
- Monitoring
- Emergency stop

---

# Live Safety

Never allow:

```text
Strategy
   ↓
Bypass Risk
   ↓
Bybit
```

The only valid route is:

```text
Strategy
   ↓
Signal
   ↓
Risk Engine
   ↓
Order Manager
   ↓
Bybit Adapter
   ↓
Bybit
```

---

# Emergency Stop

Provide an emergency mechanism to:

```text
Stop new orders
Cancel eligible open orders
Pause bots
```

Any automated emergency behavior must be designed carefully around actual exchange state.

---

# Initial Live Trading

Do NOT immediately allow unrestricted capital.

Start with:

```text
Small account
Small position sizes
Strict risk limits
Limited markets
Limited strategies
```

---

# Definition of Done

A controlled live bot can execute trades while all risk, logging, reconciliation and safety systems remain active.

---

# PHASE 10 — PORTFOLIO & ANALYTICS

## Objective

Provide users with detailed performance information.

---

# Portfolio

Track:

- Total equity
- Available balance
- Used margin where applicable
- Positions
- Exposure
- Realized P&L
- Unrealized P&L

---

# Analytics

Show:

```text
Total Return
Daily P&L
Weekly P&L
Monthly P&L
Win Rate
Profit Factor
Maximum Drawdown
Average Trade
Risk/Reward
```

---

# Strategy Analytics

Users should be able to compare:

```text
Strategy A
Strategy B
Strategy C
```

based on historical and live performance.

---

# Bot Analytics

Show:

- Bot performance
- Trade count
- Win rate
- P&L
- Drawdown
- Runtime
- Error frequency

---

# Dashboard

Create a professional trading dashboard.

Potential sections:

```text
Portfolio
Markets
Strategies
Backtests
Bots
Orders
Positions
Trades
Analytics
Settings
```

---

# Definition of Done

Users can understand exactly how their strategies, bots and portfolio are performing.

---

# PHASE 11 — NOTIFICATIONS & MONITORING

## Objective

Make Trading Bolt observable and operationally reliable.

---

# Notifications

Support events such as:

```text
Bot Started
Bot Stopped
Bot Error
Order Filled
Order Rejected
Position Opened
Position Closed
Risk Limit Triggered
Circuit Breaker Triggered
Broker Disconnected
```

---

# Notification Channels

Start with:

```text
In-app notifications
```

Potential later channels:

```text
Email
Telegram
WhatsApp
SMS
Push Notifications
```

Do not implement every channel at once.

---

# Monitoring

Monitor:

- API health
- Worker health
- Redis
- PostgreSQL
- Exchange connection
- WebSocket connection
- Bot health
- Queue failures
- Order failures
- Reconciliation failures

---

# Audit Logs

Important financial actions should be recorded.

Examples:

```text
Bot started
Bot stopped
Risk rule changed
Broker connected
Order submitted
Order cancelled
Live mode enabled
```

---

# Definition of Done

The system can identify important failures and communicate them to the user/operator.

---

# PHASE 12 — AI FEATURES

## Objective

Introduce AI only after the deterministic trading infrastructure is stable.

AI is an assistant, not an unrestricted trading authority.

---

# AI Architecture

```text
Trading Bolt
      │
      ├── Deterministic Trading Engine
      │
      └── AI Layer
```

The AI layer must NOT replace:

```text
Risk Engine
Order Manager
Broker Adapter
```

---

# AI Features

Potential features:

## 1. Strategy Generator

User:

```text
Create a BTC strategy using EMA and RSI.
```

AI generates a structured strategy proposal.

---

## 2. Strategy Explanation

Explain:

- How the strategy works
- Entry rules
- Exit rules
- Risks
- Parameters

---

## 3. Backtest Analysis

AI can analyze completed backtests.

Example:

```text
Why did this strategy lose money?
```

---

## 4. Performance Analysis

AI can summarize:

- Drawdown
- Losing periods
- Winning periods
- Risk issues
- Strategy behavior

---

## 5. Trading Journal

AI can summarize trading activity.

---

# AI Safety

AI-generated strategies must pass:

```text
Validation
   ↓
Backtesting
   ↓
Risk Validation
   ↓
User Approval
```

before being considered for execution.

AI must NOT:

```text
Generate arbitrary code
       ↓
Execute immediately
       ↓
Place live order
```

---

# Definition of Done

AI can assist users without bypassing deterministic trading and risk controls.

---

# PHASE 13 — PRODUCTION HARDENING

## Objective

Prepare Trading Bolt for real production use.

---

# Security

Review:

- Authentication
- Authorization
- API security
- Broker credentials
- Encryption
- Secrets
- Rate limits
- CSRF where applicable
- CORS
- Input validation
- Dependency vulnerabilities

---

# Reliability

Test:

- Database failures
- Redis failures
- Worker crashes
- API crashes
- Exchange downtime
- WebSocket disconnects
- Network failures
- Duplicate events
- Partial failures

---

# Recovery

The system should be able to recover safely after:

```text
API restart
Worker restart
Database restart
Redis restart
WebSocket reconnect
Exchange reconnect
```

---

# Database

Ensure:

- Proper indexes
- Migrations
- Backups
- Data integrity
- Constraints
- Transaction boundaries

---

# Performance

Optimize only after measuring.

Potential areas:

- Database queries
- Redis usage
- WebSocket processing
- Queue throughput
- Market data processing
- API response times

---

# Observability

Production monitoring should include:

```text
Logs
Metrics
Health checks
Error tracking
Queue monitoring
Database monitoring
Broker connectivity
Bot monitoring
```

---

# Deployment

Potential architecture:

```text
                    Internet
                       │
                       ▼
                  Next.js App
                       │
                       ▼
                  NestJS API
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
      PostgreSQL     Redis        Worker
                                      │
                                      ▼
                                    Bybit
```

Actual deployment infrastructure should be chosen based on project requirements and budget.

---

# 5. GLOBAL TESTING STRATEGY

Testing must exist throughout development.

Do not wait until the end.

---

## Unit Tests

Test:

- Indicators
- Strategies
- Signals
- Risk calculations
- Position sizing
- P&L
- Order state transitions
- Data transformations

---

## Integration Tests

Test:

- PostgreSQL
- Redis
- BullMQ
- API modules
- Broker adapter
- Market data

---

## End-to-End Tests

Test complete workflows.

Example:

```text
Register
   ↓
Login
   ↓
Create Strategy
   ↓
Run Backtest
   ↓
Create Paper Bot
   ↓
Start Bot
   ↓
Generate Signal
   ↓
Risk Check
   ↓
Paper Order
   ↓
Position
   ↓
P&L
```

---

# 6. GLOBAL FINANCIAL SAFETY RULES

These rules apply to every phase.

## Rule 1

Strategies generate signals.

They do not place orders.

## Rule 2

Every order passes through the risk engine.

## Rule 3

The frontend cannot execute trades.

## Rule 4

Bybit credentials remain server-side.

## Rule 5

Paper trading and live trading must be completely distinguishable.

## Rule 6

Never assume an order filled.

## Rule 7

Reconcile exchange state.

## Rule 8

Use decimal-safe financial calculations.

## Rule 9

Use idempotency for financial operations.

## Rule 10

Never silently ignore financial errors.

---

# 7. EXECUTION ORDER

The AI coding agent must implement phases sequentially.

```text
PHASE 0
   ↓
PHASE 1
   ↓
PHASE 2
   ↓
PHASE 3
   ↓
PHASE 4
   ↓
PHASE 5
   ↓
PHASE 6
   ↓
PHASE 7
   ↓
PHASE 8
   ↓
PHASE 9
   ↓
PHASE 10
   ↓
PHASE 11
   ↓
PHASE 12
   ↓
PHASE 13
```

Do not skip a foundational phase simply because a later feature appears easier to implement.

---

# 8. PHASE APPROVAL SYSTEM

After completing each phase, the AI agent must STOP.

It must provide:

```text
Summary

Files Changed

Architecture Changes

Database Changes

API Changes

Tests Added

Tests Passed

Verification

Known Issues

Security Considerations

Next Phase
```

The developer must review the work before continuing.

---

# 9. AI CODING AGENT RULE

The AI agent must never automatically proceed from one major phase to another.

For example:

```text
Finish Phase 3
       ↓
STOP
       ↓
Developer Review
       ↓
Approval
       ↓
Phase 4
```

---

# 10. NO FAKE IMPLEMENTATION

The AI agent must not create fake functionality simply to make the UI appear complete.

Forbidden examples:

```text
Fake Bybit orders
Fake balances
Fake P&L
Fake positions
Fake live trading
Fake broker responses
Fake performance metrics
```

If something is not implemented, clearly label it as unavailable or pending.

---

# 11. DEVELOPMENT PRIORITY

When deciding what to build first, use this priority:

```text
1. Correctness
2. Financial safety
3. Security
4. Reliability
5. Testability
6. Maintainability
7. User experience
8. Performance
9. Development speed
```

---

# 12. MVP DEFINITION

The first meaningful Trading Bolt MVP should allow a user to:

```text
Create Account
      ↓
Create Strategy
      ↓
Configure Strategy
      ↓
Backtest Strategy
      ↓
View Backtest Results
      ↓
Create Paper Trading Bot
      ↓
Start Bot
      ↓
Monitor Bot
      ↓
View Orders
      ↓
View Positions
      ↓
View Trades
      ↓
View Performance
```

Then:

```text
Paper Trading
      ↓
Bybit Demo/Testnet
      ↓
Controlled Live Trading
```

---

# 13. WHAT SHOULD NOT BE IN THE FIRST MVP

Do not initially build:

- Mobile app
- Copy trading
- Social trading
- Trading marketplace
- Complex portfolio optimization
- Multi-exchange support
- Advanced machine-learning predictions
- Autonomous AI trading
- Subscription billing
- Cryptocurrency wallet
- NFT functionality
- Unnecessary microservices
- Dozens of strategies

The MVP should focus on building a reliable trading infrastructure.

---

# 14. FINAL TARGET ARCHITECTURE

The long-term Trading Bolt architecture should look approximately like:

```text
                         ┌─────────────────┐
                         │   NEXT.JS WEB   │
                         │    DASHBOARD    │
                         └────────┬────────┘
                                  │
                                  ▼
                         ┌─────────────────┐
                         │   NESTJS API    │
                         └────────┬────────┘
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
                 ▼                ▼                ▼
           PostgreSQL          Redis            BullMQ
                                                    │
                                                    ▼
                                                 Worker
                                                    │
                                                    ▼
                                           Trading Engine
                                                    │
                              ┌─────────────────────┼───────────────────┐
                              │                     │                   │
                              ▼                     ▼                   ▼
                         Strategy               Risk               Order
                          Engine                Engine              Manager
                              │                     │                   │
                              └─────────────────────┼───────────────────┘
                                                    │
                                                    ▼
                                             Broker Adapter
                                                    │
                                                    ▼
                                           ┌────────────────┐
                                           │     BYBIT      │
                                           └────────────────┘
```

AI eventually becomes:

```text
                    AI ASSISTANT
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
         Strategy    Backtest     Analytics
         Generation  Analysis     Explanation
             │           │           │
             └───────────┼───────────┘
                         ▼
                     USER APPROVAL
                         │
                         ▼
                  DETERMINISTIC
                  TRADING ENGINE
                         │
                         ▼
                     RISK ENGINE
                         │
                         ▼
                    ORDER MANAGER
                         │
                         ▼
                       BYBIT
```

AI must never bypass the deterministic safety architecture.

---

# 15. FINAL SUCCESS CRITERIA

Trading Bolt should eventually become a system where:

```text
Market Data
     ↓
Strategy
     ↓
Signal
     ↓
Risk
     ↓
Order
     ↓
Bybit
     ↓
Execution
     ↓
Position
     ↓
Portfolio
     ↓
Analytics
     ↓
AI-Assisted Analysis
```

Every stage must be observable, testable and auditable.

The ultimate goal is not simply to create a bot that places trades.

The goal is to create a **reliable trading platform whose strategy, risk, execution, data, and portfolio systems are separated and independently testable.**

---

# END OF IMPLEMENTATION ROADMAP
