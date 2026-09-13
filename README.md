# TRADING BOLT

## AI-Powered Algorithmic Trading & Strategy Automation Platform

> **Build. Backtest. Validate. Automate. Monitor.**

---

# 1. PROJECT OVERVIEW

Trading Bolt is a modular algorithmic trading platform designed to allow users to:

- Connect supported trading accounts/brokers.
- View real-time market data.
- Create and configure trading strategies.
- Backtest strategies against historical data.
- Analyze strategy performance.
- Run strategies in paper-trading mode.
- Manage risk.
- Monitor automated trading bots.
- Execute trades through supported brokers/exchanges.
- Track orders, positions, trades and portfolio performance.
- Eventually use AI to assist with strategy creation, analysis and optimization.

Trading Bolt must be designed as a serious financial software platform.

It must prioritize:

1. Correctness
2. Safety
3. Security
4. Testability
5. Auditability
6. Reliability
7. Maintainability
8. Scalability

Do NOT treat Trading Bolt as a simple CRUD application.

---

# 2. IMPORTANT DEVELOPMENT PHILOSOPHY

The AI coding agent must NOT attempt to build the entire platform in one operation.

Development must happen incrementally.

The correct development cycle is:

```text
PLAN
 ↓
DESIGN
 ↓
IMPLEMENT
 ↓
TEST
 ↓
VERIFY
 ↓
DOCUMENT
 ↓
MOVE TO NEXT PHASE
```

Before making a major architectural change:

1. Inspect the existing codebase.
2. Understand the current architecture.
3. Identify dependencies.
4. Explain the proposed change.
5. Implement the smallest safe change.
6. Run tests.
7. Fix failures.
8. Update documentation.

Never rewrite working systems unnecessarily.

---

# 3. TECHNOLOGY STACK

## Frontend

Use:

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- TradingView Lightweight Charts
- WebSockets where necessary

The frontend is responsible for:

- Dashboard
- Authentication UI
- Strategy management
- Bot management
- Charts
- Portfolio visualization
- Trade history
- Backtest reports
- Risk configuration
- Settings
- Admin interface

The frontend must NEVER contain core trading logic.

---

# 4. BACKEND

Use:

- Node.js
- TypeScript
- NestJS
- PostgreSQL
- Prisma or TypeORM
- Redis
- BullMQ
- WebSockets

NestJS should be organized into clear domain modules.

Suggested modules:

```text
auth
users
accounts
brokers
markets
strategies
backtests
bots
orders
trades
positions
portfolio
risk
notifications
analytics
admin
ai
```

---

# 5. FUTURE PYTHON SERVICE

Trading Bolt should be designed so that Python can be introduced later.

Python may eventually handle:

- Advanced quantitative analysis
- Machine learning
- Statistical modelling
- Advanced backtesting
- Optimization
- AI models
- Research workflows

Do NOT introduce Python into the MVP unless there is a clear technical reason.

The initial MVP should be capable of operating primarily with TypeScript/Node.js.

---

# 6. DATABASE

Use PostgreSQL.

The database must be designed around clear relationships.

Potential entities include:

```text
User
TradingAccount
Broker
BrokerConnection
Asset
Market
Strategy
StrategyVersion
Backtest
BacktestTrade
Bot
BotRun
Signal
Order
OrderEvent
Trade
Position
Portfolio
PortfolioSnapshot
RiskRule
Notification
AuditLog
```

Do not create unnecessary tables.

Every database entity must have a clear purpose.

Financial records must be immutable where appropriate.

Never silently modify historical financial records.

---

# 7. REDIS

Redis should be used for:

- Caching
- Real-time state
- WebSocket event distribution
- Job queues
- Rate limiting
- Temporary bot state

Do not use Redis as the permanent source of truth for financial records.

PostgreSQL remains the permanent source of truth.

---

# 8. BACKGROUND JOBS

Use BullMQ for asynchronous jobs.

Potential queues:

```text
market-data
backtesting
strategy-analysis
bot-execution
order-reconciliation
notifications
analytics
ai-processing
```

Jobs must be:

- Retryable
- Idempotent where possible
- Observable
- Logged
- Protected against duplicate execution

---

# 9. CORE TRADING ARCHITECTURE

Trading Bolt must follow this architecture:

```text
Market Data
     ↓
Data Normalization
     ↓
Indicator/Feature Processing
     ↓
Strategy
     ↓
Signal
     ↓
Risk Manager
     ↓
Order Manager
     ↓
Broker Adapter
     ↓
Broker/Exchange
     ↓
Order Events
     ↓
Trade
     ↓
Position
     ↓
Portfolio
```

IMPORTANT:

A strategy must NEVER directly execute an order.

Incorrect:

```text
Strategy → Broker
```

Correct:

```text
Strategy
   ↓
Signal
   ↓
Risk Manager
   ↓
Order Manager
   ↓
Broker
```

---

# 10. STRATEGY ENGINE

Strategies must be modular.

Create a common strategy interface.

Conceptually:

```typescript
interface Strategy {
  name: string;

  generateSignal(marketData: MarketData): Promise<TradingSignal>;
}
```

Strategies should produce signals.

Example:

```text
BUY
SELL
HOLD
```

A signal may contain:

```text
symbol
action
confidence
timestamp
strategyId
metadata
```

The strategy must NOT:

- Access the database directly.
- Place broker orders.
- Modify account balances.
- Bypass risk management.

---

# 11. INITIAL STRATEGIES

For the MVP, create simple deterministic strategies.

Examples:

### Moving Average Crossover

```text
Fast MA > Slow MA
→ BUY

Fast MA < Slow MA
→ SELL
```

### RSI Strategy

Example configurable thresholds:

```text
RSI < oversold
→ potential BUY

RSI > overbought
→ potential SELL
```

### Breakout Strategy

Detect configured price breakouts.

These strategies are for testing the platform architecture.

They should NOT be presented as guaranteed profitable strategies.

---

# 12. BACKTESTING ENGINE

Backtesting is one of the most important components.

The backtester must simulate:

- Historical candles
- Signals
- Orders
- Fills
- Fees
- Slippage
- Position changes
- Portfolio balance
- Profit/loss
- Drawdown

The backtester must avoid:

- Look-ahead bias
- Future-data leakage
- Unrealistic fills
- Incorrect timestamps
- Ignoring fees
- Ignoring slippage

Backtest results must clearly indicate that historical performance does not guarantee future results.

---

# 13. BACKTEST METRICS

Calculate where applicable:

```text
Initial Capital
Final Capital
Net Profit
ROI
Total Trades
Winning Trades
Losing Trades
Win Rate
Average Win
Average Loss
Profit Factor
Maximum Drawdown
Sharpe Ratio
Average Trade
Largest Win
Largest Loss
```

Do not fabricate metrics.

If a metric cannot be calculated reliably, return null or mark it unavailable.

---

# 14. PAPER TRADING

Paper trading must be implemented before live trading.

Required flow:

```text
Backtest
   ↓
Paper Trading
   ↓
Live Trading
```

Paper trading should use the same interfaces as live trading.

Create:

```text
Broker
 ├── PaperBroker
 └── LiveBroker
```

The rest of the trading system should not need to know which implementation is being used.

---

# 15. BROKER ADAPTER ARCHITECTURE

Never place broker-specific API calls throughout the application.

Create a common interface.

Conceptually:

```typescript
interface BrokerAdapter {
  getAccountBalance(): Promise<AccountBalance>;

  getMarketPrice(symbol: string): Promise<MarketPrice>;

  placeOrder(order: OrderRequest): Promise<OrderResponse>;

  cancelOrder(orderId: string): Promise<void>;

  getOpenOrders(): Promise<Order[]>;

  getPositions(): Promise<Position[]>;
}
```

Then implement:

```text
PaperBroker
BrokerA
BrokerB
BrokerC
```

Actual broker integrations should be isolated.

---

# 16. RISK MANAGEMENT

Risk management is mandatory.

Every live order must pass through the risk engine.

The risk engine should eventually support:

- Maximum risk per trade
- Maximum daily loss
- Maximum position size
- Maximum portfolio exposure
- Maximum number of open trades
- Stop-loss requirements
- Take-profit configuration
- Maximum drawdown
- Trading session restrictions
- Symbol restrictions
- Emergency shutdown

Example:

```text
Signal
 ↓
Risk Manager
 ↓
APPROVED
 ↓
Order
```

or:

```text
Signal
 ↓
Risk Manager
 ↓
REJECTED
 ↓
No Order
```

Every rejection should be logged with a reason.

---

# 17. CIRCUIT BREAKER

Trading Bolt must have an emergency circuit breaker.

If configured risk limits are exceeded:

```text
STOP NEW ORDERS
```

The system should be able to disable:

- A strategy
- A bot
- An account
- All trading activity

depending on the configured severity.

Never automatically resume trading after a critical risk event unless explicitly configured and considered safe.

---

# 18. ORDER MANAGEMENT

Orders should have clear lifecycle states.

Example:

```text
CREATED
 ↓
SUBMITTED
 ↓
ACCEPTED
 ↓
PARTIALLY_FILLED
 ↓
FILLED
```

Alternative:

```text
CREATED
 ↓
SUBMITTED
 ↓
REJECTED
```

Or:

```text
SUBMITTED
 ↓
CANCELLED
```

Every transition must be recorded.

---

# 19. ORDER RECONCILIATION

Never assume that the local database is always correct.

The system must periodically reconcile:

```text
Local Orders
      vs
Broker Orders
```

and:

```text
Local Positions
      vs
Broker Positions
```

Differences must be detected and logged.

This is critical for live trading.

---

# 20. MONEY AND FINANCIAL CALCULATIONS

Do not use JavaScript floating-point arithmetic blindly for financial values.

Use appropriate decimal handling.

Never calculate financial values with careless:

```typescript
number;
```

operations when precision matters.

Use a suitable decimal library and consistent currency/precision rules.

---

# 21. SECURITY

Security is critical.

Never:

- Hardcode API keys.
- Commit secrets to Git.
- Expose broker secrets to the frontend.
- Store sensitive credentials as plaintext.
- Log API secrets.
- Return broker credentials through API responses.

Use:

```text
Environment variables
Secret management
Encryption where appropriate
Authentication
Authorization
Rate limiting
Input validation
Audit logging
```

Broker credentials must only be accessible by trusted backend services.

---

# 22. AUTHENTICATION

The platform should eventually support:

```text
Registration
Login
Logout
Password reset
Email verification
Session management
Role-based authorization
```

Roles may include:

```text
USER
ADMIN
SUPER_ADMIN
```

Do not build unnecessary authentication complexity during the initial phase.

---

# 23. FRONTEND ROUTES

Suggested routes:

```text
/
 /login
 /register

/dashboard

/markets
/markets/[symbol]

/strategies
/strategies/create
/strategies/[id]

/backtests
/backtests/[id]

/bots
/bots/[id]

/portfolio
/positions
/orders
/trades

/risk

/brokers
/brokers/connect

/settings

/admin
```

Protect authenticated routes.

---

# 24. DASHBOARD

The dashboard should provide a high-level overview.

Possible widgets:

```text
Total Balance
Available Balance
Today's P&L
Total P&L
Win Rate
Active Bots
Open Positions
Open Orders
Risk Status
Recent Trades
```

The dashboard should prioritize clarity over visual clutter.

Trading software must be easy to understand at a glance.

---

# 25. MARKET PAGE

A market page should eventually show:

```text
Symbol
Current Price
24h Change
Volume
Candlestick Chart
Timeframe
Indicators
Recent Signals
Open Position
```

Charting should be modular so additional indicators can be added later.

---

# 26. BOT SYSTEM

A bot represents an automated execution process.

A bot should have:

```text
Name
Strategy
Trading Account
Symbol(s)
Timeframe
Risk Configuration
Status
Created At
Updated At
```

Possible states:

```text
DRAFT
STOPPED
STARTING
RUNNING
PAUSED
ERROR
STOPPING
```

A bot must not be considered RUNNING simply because a user clicked a button.

The backend must verify actual runtime state.

---

# 27. BOT LIFECYCLE

Expected lifecycle:

```text
DRAFT
 ↓
STARTING
 ↓
RUNNING
 ↓
STOPPING
 ↓
STOPPED
```

If something fails:

```text
RUNNING
 ↓
ERROR
```

All lifecycle changes must be logged.

---

# 28. AI FEATURES

AI should be introduced gradually.

Potential features:

### AI Strategy Assistant

User:

```text
Create a momentum strategy using RSI and moving averages.
```

AI produces a strategy specification.

The system must NOT immediately deploy it.

Correct flow:

```text
AI-generated Strategy
        ↓
Validation
        ↓
Backtest
        ↓
User Review
        ↓
Paper Trading
        ↓
Optional Live Deployment
```

---

# 29. AI SAFETY

AI must never have unrestricted permission to execute live trades.

AI should not directly call:

```text
placeOrder()
```

Instead:

```text
AI
 ↓
Strategy Proposal
 ↓
Validation
 ↓
Backtest
 ↓
Risk Engine
 ↓
User/System Approval
 ↓
Execution
```

---

# 30. OBSERVABILITY

Every major service should expose health information.

Examples:

```text
/api/health
/api/ready
```

Monitor:

```text
API health
Database connection
Redis connection
Worker status
Broker connection
Bot status
Queue status
```

Use structured logs.

Example:

```json
{
  "event": "ORDER_REJECTED",
  "botId": "...",
  "symbol": "BTCUSDT",
  "reason": "DAILY_LOSS_LIMIT",
  "timestamp": "..."
}
```

---

# 31. ERROR HANDLING

Never silently swallow errors.

Bad:

```typescript
try {
  await placeOrder();
} catch {}
```

Good:

```text
Catch
 ↓
Log
 ↓
Classify
 ↓
Retry if safe
 ↓
Notify if necessary
 ↓
Persist failure state
```

Do not blindly retry financial operations that could cause duplicate orders.

---

# 32. IDEMPOTENCY

Order-related operations must be designed to avoid accidental duplicate orders.

For example:

```text
Client Request
      ↓
Idempotency Key
      ↓
Order Service
      ↓
Broker
```

If the same request is accidentally submitted twice, the system should be able to detect it.

---

# 33. TESTING REQUIREMENTS

Every major trading component requires tests.

Minimum:

```text
Unit Tests
Integration Tests
API Tests
Strategy Tests
Risk Tests
Backtesting Tests
Broker Adapter Tests
```

Critical areas must have strong test coverage.

Especially:

```text
Risk Manager
Order Manager
Position calculations
P&L calculations
Backtesting
Strategy signals
Circuit breaker
```

---

# 34. DEVELOPMENT ENVIRONMENT

The project should run locally using Docker Compose.

Expected services:

```text
web
api
postgres
redis
worker
```

Example:

```text
docker compose up
```

should start the development environment.

---

# 35. ENVIRONMENT VARIABLES

Create:

```text
.env.example
```

Never commit:

```text
.env
```

Example categories:

```text
DATABASE_URL
REDIS_URL
JWT_SECRET
ENCRYPTION_KEY
BROKER_API_KEY
BROKER_API_SECRET
AI_API_KEY
```

Use placeholders only in `.env.example`.

---

# 36. PROJECT STRUCTURE

Use:

```text
trading-bolt/
│
├── apps/
│   ├── web/
│   └── api/
│
├── packages/
│   ├── types/
│   ├── config/
│   └── validation/
│
├── workers/
│
├── database/
│
├── infrastructure/
│
├── docs/
│
├── scripts/
│
├── tests/
│
├── .env.example
├── docker-compose.yml
├── AGENTS.md
├── README.md
└── package.json
```

Keep boundaries clear.

---

# 37. SHARED TYPES

Where possible, shared TypeScript types should live in:

```text
packages/types
```

Examples:

```text
Order
Trade
Position
Strategy
Signal
Bot
Portfolio
RiskRule
Backtest
```

Avoid duplicating the same interfaces in multiple applications.

---

# 38. API VERSIONING

Use versioned APIs:

```text
/api/v1/...
```

Do not randomly change existing API contracts.

When breaking changes are required:

1. Document them.
2. Update consumers.
3. Add migration notes.
4. Test the affected functionality.

---

# 39. DOCUMENTATION

Maintain:

```text
README.md
AGENTS.md
docs/
```

Documentation should explain:

```text
Architecture
Setup
Development
Database
API
Trading engine
Strategies
Backtesting
Risk management
Deployment
Security
```

When architecture changes, update documentation.

---

# 40. GIT WORKFLOW

Use meaningful commits.

Examples:

```text
feat: add strategy registry
feat: implement paper broker
feat: add backtest engine
fix: correct position P&L calculation
test: add risk manager tests
refactor: isolate broker adapter
docs: update architecture
```

Never make giant meaningless commits such as:

```text
update
changes
fix stuff
final
```

---

# 41. DEVELOPMENT PHASES

Build Trading Bolt in this exact general order.

## PHASE 0 — PROJECT FOUNDATION

Build:

- Repository
- Monorepo
- Next.js
- NestJS
- PostgreSQL
- Redis
- Docker
- Environment configuration
- ESLint
- Prettier
- Testing
- CI
- Documentation

Do not build trading functionality yet.

---

## PHASE 1 — AUTHENTICATION

Implement:

- Registration
- Login
- Sessions
- Protected routes
- User model
- Roles

Test everything.

---

## PHASE 2 — MARKET DATA

Implement:

- Market model
- Symbol model
- Historical candle model
- Market data provider abstraction
- Market data service
- Basic chart

Do not implement live trading.

---

## PHASE 3 — STRATEGY ENGINE

Implement:

- Strategy interface
- Strategy registry
- Signal model
- Moving average strategy
- RSI strategy
- Strategy configuration

Add tests.

---

## PHASE 4 — BACKTESTING

Implement:

- Historical replay
- Simulated orders
- Fees
- Slippage
- Portfolio simulation
- Metrics
- Backtest storage
- Backtest report

Add extensive tests.

---

## PHASE 5 — RISK ENGINE

Implement:

- Risk per trade
- Position sizing
- Maximum daily loss
- Maximum exposure
- Maximum positions
- Stop-loss
- Circuit breaker

Add extensive tests.

---

## PHASE 6 — PAPER TRADING

Implement:

- Paper broker
- Paper orders
- Simulated fills
- Paper positions
- Paper portfolio
- Bot lifecycle

Test continuously.

---

## PHASE 7 — BOT ENGINE

Implement:

- Bot creation
- Bot configuration
- Bot runner
- Start/stop
- Monitoring
- Logs
- Error handling
- Queue workers

---

## PHASE 8 — LIVE BROKER

Only after paper trading is stable.

Implement:

- Broker adapter
- Secure credentials
- Order execution
- Order reconciliation
- Position reconciliation
- Rate limiting
- Retry handling
- Circuit breaker
- Audit logs

Start with ONE broker integration.

---

## PHASE 9 — ANALYTICS

Implement:

- Portfolio analytics
- Strategy analytics
- Trade analytics
- Drawdown charts
- Performance reports

---

## PHASE 10 — AI

Only after the deterministic system is stable.

Implement:

- AI strategy assistant
- Strategy generation
- Strategy explanation
- Backtest analysis
- Performance analysis
- AI research assistant

AI-generated strategies must go through validation and backtesting.

---

# 42. MVP DEFINITION

The first MVP should NOT attempt to contain every possible feature.

The MVP should prove this workflow:

```text
User
 ↓
Create Strategy
 ↓
Configure Strategy
 ↓
Run Backtest
 ↓
View Results
 ↓
Enable Paper Trading
 ↓
Run Bot
 ↓
Monitor Bot
 ↓
View Trades
 ↓
Analyze Performance
```

Only after this workflow works reliably should live trading be introduced.

---

# 43. WHAT NOT TO BUILD YET

Do NOT initially build:

- Multiple broker integrations
- Complex AI prediction models
- Social trading
- Copy trading
- Mobile app
- Advanced portfolio optimization
- Cryptocurrency wallet
- Payment subscriptions
- Marketplace
- Multi-region infrastructure
- Microservices everywhere

Keep the MVP focused.

---

# 44. AI CODING AGENT RULES

You are an AI software engineer working on Trading Bolt.

Before writing code:

1. Inspect the repository.
2. Read README.md.
3. Read AGENTS.md.
4. Inspect related modules.
5. Understand existing patterns.
6. Identify dependencies.
7. Create a plan.

Do not immediately start coding.

For every non-trivial task, explain:

```text
Goal
Files affected
Implementation approach
Potential risks
Testing approach
```

Then implement.

---

# 45. NEVER DO THESE THINGS

Never:

- Rewrite the whole project without approval.
- Delete working code unnecessarily.
- Change architecture randomly.
- Introduce dependencies without justification.
- Hardcode secrets.
- Put trading logic in React components.
- Let strategies bypass risk management.
- Let AI directly execute unrestricted live trades.
- Mix paper and live trading state.
- Ignore failed tests.
- Ignore TypeScript errors.
- Ignore lint errors.
- Hide exceptions.
- Fake API responses when implementing production functionality.
- Claim something works without testing it.

---

# 46. AI AGENT RESPONSE FORMAT

When asked to implement a feature, respond internally using this workflow:

```text
1. UNDERSTAND
2. INSPECT
3. PLAN
4. IMPLEMENT
5. TEST
6. DEBUG
7. VERIFY
8. DOCUMENT
```

After implementation, report:

```text
Implemented:
- ...

Files changed:
- ...

Tests:
- ...

Potential issues:
- ...

Next recommended step:
- ...
```

Do not claim success if tests were not actually run.

---

# 47. DEFINITION OF DONE

A feature is NOT complete merely because the code has been written.

A feature is complete only when:

- Code compiles.
- TypeScript passes.
- Lint passes.
- Tests pass.
- Database migrations work.
- API behavior is verified.
- Error handling exists.
- Security considerations are addressed.
- Documentation is updated where necessary.
- Existing functionality remains intact.

---

# 48. FINAL ARCHITECTURAL PRINCIPLE

Trading Bolt must remain modular.

The long-term architecture should allow:

```text
                    TRADING BOLT
                         │
          ┌──────────────┼──────────────┐
          │              │              │
       Frontend        Backend       Workers
          │              │              │
          │              │              │
       Next.js        NestJS        BullMQ
                         │
             ┌───────────┼───────────┐
             │           │           │
         PostgreSQL     Redis      Trading
                                    Engine
                                      │
                           ┌──────────┴──────────┐
                           │                     │
                       Strategies             Risk
                           │                     │
                           └──────────┬──────────┘
                                      │
                                  Execution
                                      │
                                  Brokers
                                      │
                                  Markets
```

Later:

```text
                         Trading Bolt
                              │
                    ┌─────────┴─────────┐
                    │                   │
                TypeScript            Python
                 Platform           Quant/AI
                    │                   │
                    └─────────┬─────────┘
                              │
                         PostgreSQL
                              │
                            Redis
```

The architecture must allow this evolution without requiring a complete rewrite.

---

# 49. FIRST TASK FOR THE AI AGENT

Do NOT start building all features.

Your first task is:

```text
Analyze this specification and inspect the repository.

Do not implement trading functionality yet.

First:

1. Determine whether the repository is empty or already contains code.
2. Propose the final folder structure.
3. Identify required dependencies.
4. Design the initial database architecture.
5. Design the API module structure.
6. Design the development environment.
7. Identify potential architectural risks.
8. Create a PHASE_0_IMPLEMENTATION_PLAN.md.

Do not proceed to Phase 1 until the foundation has been reviewed and verified.

After completing the analysis, explain the proposed architecture before making major changes.
```

---

# 50. CORE PRINCIPLE

The goal is NOT to create a huge amount of code.

The goal is to create a system that is:

```text
CORRECT
SAFE
TESTABLE
OBSERVABLE
MODULAR
SECURE
SCALABLE
MAINTAINABLE
```

Build slowly.

Verify everything.

Never assume that generated code is correct.

Trading Bolt deals with financial operations. Therefore, correctness and risk management are more important than speed of implementation.

**Build the foundation first.**
