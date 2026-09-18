# TRADING BOLT — AI AGENT DEVELOPMENT RULES

## 1. ROLE

You are an AI software engineer working on **Trading Bolt**, a serious algorithmic trading platform.

You are not simply generating code.

You are responsible for producing:

- Correct code
- Maintainable architecture
- Secure implementations
- Testable systems
- Reliable financial calculations
- Clear documentation
- Small, reviewable changes

The project's `README.md` is the primary product specification.

This `AGENTS.md` defines how you must work inside the repository.

When there is a conflict:

1. Security and correctness come first.
2. Existing approved architecture comes next.
3. `README.md` defines product requirements.
4. This file defines development behavior.
5. User instructions define the immediate task.

Never make large architectural changes without explaining them first.

---

# 2. CORE PRINCIPLE

Trading Bolt is financial software.

Therefore:

> Correctness is more important than speed.

Never assume that generated code is correct.

Never claim that something works unless it has been tested or verified.

Never implement financial functionality using shortcuts that could create incorrect balances, positions, orders, P&L, or risk calculations.

---

# 3. READ BEFORE CODING

Before implementing any non-trivial task:

1. Read `README.md`.
2. Read `AGENTS.md`.
3. Inspect the existing repository.
4. Locate the relevant module.
5. Inspect related files.
6. Understand existing conventions.
7. Check existing tests.
8. Identify dependencies.
9. Create an implementation plan.
10. Then write code.

Do not immediately start generating code.

---

# 4. DO NOT OVERWRITE THE ARCHITECTURE

Do not:

- Rewrite the entire project.
- Replace frameworks without approval.
- Replace the database without approval.
- Introduce microservices unnecessarily.
- Introduce Python without a clear technical requirement.
- Replace working code simply because you prefer another approach.
- Delete existing functionality to make implementation easier.

If you believe the architecture should change:

1. Explain why.
2. Identify the affected components.
3. Explain benefits and risks.
4. Propose the migration.
5. Wait for approval when the change is significant.

---

# 5. CURRENT TECHNOLOGY STACK

The primary MVP stack is:

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- TradingView Lightweight Charts

## Backend

- Node.js
- TypeScript
- NestJS

## Database

- PostgreSQL

## Cache / Real-Time / Queues

- Redis
- BullMQ

## Infrastructure

- Docker
- Docker Compose

## Testing

Use appropriate testing tools for:

- Unit tests
- Integration tests
- API tests
- End-to-end tests

---

# 6. FUTURE PYTHON SUPPORT

Python may eventually be introduced for:

- Quantitative research
- Advanced backtesting
- Machine learning
- Statistical modelling
- Optimization
- AI/ML workloads

Do not introduce Python simply because Trading Bolt is a trading application.

Use Python only when its ecosystem provides a meaningful advantage.

The TypeScript architecture must remain capable of integrating with a future Python service.

---

# 7. ARCHITECTURE

Maintain clear separation between:

```text
Frontend
    ↓
API
    ↓
Application Services
    ↓
Trading Engine
    ↓
Risk Engine
    ↓
Order Manager
    ↓
Broker Adapter
```

Supporting infrastructure:

```text
PostgreSQL
Redis
BullMQ
Workers
```

The frontend must never directly communicate with brokers.

The frontend must never contain core trading logic.

---

# 8. DOMAIN SEPARATION

Keep these responsibilities separate:

```text
Authentication
Users
Accounts
Markets
Strategies
Signals
Backtesting
Risk
Orders
Trades
Positions
Portfolio
Bots
Brokers
Analytics
AI
Notifications
```

Do not create a giant service containing unrelated business logic.

Prefer small, focused modules.

---

# 9. STRATEGY RULE

Strategies generate signals.

Strategies do NOT execute orders.

Correct:

```text
Market Data
    ↓
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

Incorrect:

```text
Strategy
    ↓
Broker
```

A strategy must never directly call:

```text
placeOrder()
```

or any equivalent broker execution function.

---

# 10. RISK MANAGEMENT RULE

Every live order must pass through the risk engine.

The risk engine may reject an order.

Example:

```text
Signal
   ↓
Risk Manager
   ↓
REJECTED
```

No order should be sent to a broker after a risk rejection.

Risk checks should be deterministic and testable.

---

# 11. PAPER VS LIVE TRADING

Paper trading and live trading must use the same abstraction.

Use a broker interface such as:

```text
BrokerAdapter
    ├── PaperBroker
    └── LiveBroker
```

Do not duplicate the entire trading engine for paper trading.

The main difference should be the execution implementation.

Never accidentally route paper orders to a live broker.

Never allow test environments to use production credentials by default.

---

# 12. BROKER INTEGRATIONS

Broker-specific code must be isolated.

Never scatter broker API calls throughout:

- controllers
- React components
- strategy classes
- risk classes
- database services

Use:

```text
BrokerAdapter
```

and provider-specific implementations.

Example:

```text
brokers/
├── broker.interface.ts
├── paper/
├── provider-a/
└── provider-b/
```

The rest of Trading Bolt should interact with the abstraction rather than provider-specific APIs.

---

# 13. DATABASE RULES

PostgreSQL is the source of truth for permanent financial records.

Important records include:

- Orders
- Trades
- Positions
- Portfolio snapshots
- Account balances
- Strategy versions
- Backtest results
- Audit logs

Do not use Redis as the permanent source of truth.

Do not silently delete historical financial records.

Prefer immutable event/history records where appropriate.

---

# 14. FINANCIAL PRECISION

Never rely on careless JavaScript floating-point arithmetic for financial calculations.

Avoid patterns such as:

```typescript
const total = price * quantity;
```

when precision requirements make this unsafe.

Use a proper decimal strategy/library.

Define consistent rules for:

- Price precision
- Quantity precision
- Currency precision
- Fees
- P&L
- Position size

Financial calculations must have tests.

---

# 15. ORDER LIFECYCLE

Orders must have explicit states.

Example:

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

Do not allow arbitrary state transitions.

Every important state transition should be recorded.

---

# 16. IDEMPOTENCY

Financial operations must protect against duplicate execution.

For order-related operations, use appropriate idempotency mechanisms.

Example:

```text
Request
   ↓
Idempotency Key
   ↓
Order Service
   ↓
Broker
```

Never blindly retry an order operation if doing so could create a duplicate order.

Retries must be designed around the specific operation.

---

# 17. ORDER RECONCILIATION

Never assume local state is always correct.

The system must eventually be capable of comparing:

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

Differences must be detected, logged, and handled safely.

---

# 18. RISK LIMITS

The risk system should support configurable controls such as:

- Maximum risk per trade
- Maximum daily loss
- Maximum position size
- Maximum portfolio exposure
- Maximum open positions
- Maximum drawdown
- Stop-loss requirements
- Take-profit requirements
- Symbol restrictions
- Trading session restrictions

Risk limits must be enforced server-side.

Never trust values supplied by the frontend.

---

# 19. CIRCUIT BREAKER

Trading Bolt must support emergency shutdown mechanisms.

A circuit breaker may stop:

```text
A strategy
A bot
An account
All trading
```

depending on the severity.

Examples of triggering conditions:

```text
Daily loss limit exceeded
Maximum drawdown exceeded
Broker connection failure
Unexpected position mismatch
Repeated execution failures
```

A critical shutdown should not automatically resume without explicit safe logic.

---

# 20. SECURITY

Never:

- Hardcode secrets.
- Commit API keys.
- Commit passwords.
- Expose broker credentials to the frontend.
- Log secrets.
- Return secret values through API responses.
- Put production credentials in test fixtures.
- Store sensitive credentials as plaintext when encryption is required.

Use:

```text
Environment variables
Secret management
Encryption
Authentication
Authorization
Rate limiting
Validation
Audit logging
```

---

# 21. ENVIRONMENT VARIABLES

Use:

```text
.env
.env.example
```

`.env` must never be committed.

`.env.example` must contain placeholders only.

Example:

```text
DATABASE_URL=
REDIS_URL=
JWT_SECRET=
ENCRYPTION_KEY=
AI_API_KEY=
BROKER_API_KEY=
BROKER_API_SECRET=
# Binance is the primary live broker; BINANCE_ENV must be 'testnet' except
# in production (mainnet is refused when NODE_ENV is not 'production').
BINANCE_ENV=testnet
BINANCE_API_KEY=
BINANCE_API_SECRET=
# Bybit is an optional second live broker / demo capability.
BYBIT_API_KEY=
BYBIT_API_SECRET=
BYBIT_ENVIRONMENT=demo
```

Never place actual credentials in source code.

---

# 22. FRONTEND RULES

The frontend is responsible for:

- UI
- User interaction
- Visualization
- Forms
- Dashboard
- Charts
- State presentation

The frontend must NOT:

- Execute trades directly.
- Store broker secrets.
- Implement core risk calculations.
- Decide whether an order is safe.
- Bypass backend validation.

All important decisions must happen server-side.

---

# 23. API RULES

Use versioned APIs:

```text
/api/v1/...
```

Validate all incoming data.

Never trust:

- User IDs
- Account IDs
- Strategy IDs
- Order IDs
- Risk values
- Prices
- Quantities
- Permissions

provided by the client.

Authorization must be checked server-side.

---

# 24. ERROR HANDLING

Never silently swallow errors.

Bad:

```typescript
try {
  await operation();
} catch {}
```

Instead:

```text
Catch
 ↓
Classify
 ↓
Log
 ↓
Recover / Retry if safe
 ↓
Persist failure when required
 ↓
Notify when required
```

Errors must contain useful context without exposing secrets.

---

# 25. LOGGING

Use structured logging.

Important events include:

```text
USER_CREATED
LOGIN_FAILED
STRATEGY_CREATED
BACKTEST_STARTED
BACKTEST_COMPLETED
BOT_STARTED
BOT_STOPPED
SIGNAL_GENERATED
RISK_CHECK_FAILED
ORDER_CREATED
ORDER_SUBMITTED
ORDER_FILLED
ORDER_REJECTED
POSITION_UPDATED
BROKER_ERROR
CIRCUIT_BREAKER_TRIGGERED
```

Logs must never contain:

- API secrets
- Passwords
- Authentication tokens
- Private credentials

---

# 26. TESTING

Tests are mandatory.

At minimum, test:

```text
Authentication
Strategies
Signals
Risk calculations
Position sizing
P&L
Backtesting
Orders
Broker adapters
Bot lifecycle
Circuit breaker
API authorization
```

Financial logic requires especially strong test coverage.

Before declaring a feature complete:

```text
Type check
   ↓
Lint
   ↓
Unit tests
   ↓
Integration tests
   ↓
Relevant E2E tests
```

Fix failures rather than ignoring them.

---

# 27. BACKTESTING RULES

Backtesting must be realistic.

Do not introduce:

- Look-ahead bias
- Future-data leakage
- Impossible fills
- Incorrect timestamps
- Unrealistic execution
- Missing fees
- Missing slippage

Do not modify historical data simply to improve results.

Backtest results must be reproducible.

---

# 28. AI RULES

AI is an assistant, not an unrestricted trading authority.

AI may eventually:

- Generate strategy proposals.
- Explain strategies.
- Analyze backtest results.
- Analyze performance.
- Help users research strategies.
- Suggest improvements.

AI must NOT directly bypass:

```text
Validation
Risk Engine
User/System Approval
Broker Execution Controls
```

Correct:

```text
AI
 ↓
Strategy Proposal
 ↓
Validation
 ↓
Backtest
 ↓
Risk Review
 ↓
Approval
 ↓
Execution
```

Incorrect:

```text
AI
 ↓
Live Broker
```

---

# 29. AI-GENERATED CODE

When writing code:

- Follow existing project conventions.
- Reuse existing utilities.
- Avoid duplicate functionality.
- Prefer simple implementations.
- Do not create unnecessary abstractions.
- Do not add dependencies without justification.

Before adding a package:

1. Check whether an existing package already solves the problem.
2. Check whether the functionality can be implemented safely without it.
3. Consider package maintenance and security.
4. Explain why the dependency is needed.

---

# 30. DO NOT CREATE FAKE FUNCTIONALITY

Do not pretend an integration works.

Avoid:

```typescript
return {
  success: true,
};
```

when the actual operation has not happened.

Avoid fake broker responses in production paths.

Mock data is acceptable only when explicitly used for:

- Tests
- Development fixtures
- UI prototypes

Clearly label mock implementations.

---

# 31. WORK IN SMALL STEPS

Do not implement multiple unrelated systems in one task.

Bad:

```text
Build authentication, trading, AI, payments and live broker integration.
```

Good:

```text
Implement user registration.

Then:
- Add tests.
- Verify.
- Commit.

Next:
Implement login.
```

Keep changes focused.

---

# 32. BEFORE EACH TASK

Before coding, determine:

```text
What is being built?
Why is it needed?
Which module owns it?
Which files are affected?
What existing code can be reused?
What could break?
How will it be tested?
```

For complex work, create a short plan before implementation.

---

# 33. AFTER EACH TASK

After coding:

1. Run formatting.
2. Run linting.
3. Run type checking.
4. Run relevant tests.
5. Run integration tests if applicable.
6. Inspect changed files.
7. Verify behavior.
8. Update documentation when necessary.

Never say:

> "Everything works."

unless it has actually been verified.

---

# 34. GIT RULES

Use meaningful commits.

Examples:

```text
feat: add strategy registry
feat: implement paper broker
feat: add risk manager
feat: add backtesting engine
fix: correct position pnl calculation
fix: prevent duplicate order submission
test: add circuit breaker tests
refactor: isolate broker adapter
docs: update trading architecture
```

Do not use meaningless commits such as:

```text
update
fix
changes
final
done
```

Never force-push or rewrite shared history without explicit instruction.

---

# 35. MIGRATIONS

Database schema changes must use proper migrations.

Never manually modify production database structure without a migration.

Every migration must be:

- Reproducible
- Reviewable
- Tested

Avoid destructive migrations unless explicitly approved.

---

# 36. API COMPATIBILITY

Do not casually break existing API contracts.

Before changing an API:

1. Find all consumers.
2. Determine the impact.
3. Update consumers.
4. Update tests.
5. Update documentation.

Use API versioning for major breaking changes.

---

# 37. PERFORMANCE

Do not prematurely optimize.

First make the system:

```text
Correct
Reliable
Testable
```

Then optimize measured bottlenecks.

Do not add caching everywhere.

Do not introduce distributed systems without a real need.

---

# 38. OBSERVABILITY

Important services must expose health information.

Examples:

```text
/api/health
/api/ready
```

Health checks should eventually verify:

```text
API
Database
Redis
Workers
Broker connectivity
```

---

# 39. DOCKER

Local development should be reproducible.

Docker Compose should eventually support:

```text
web
api
postgres
redis
worker
```

A new developer should be able to understand how to start the environment from the documentation.

---

# 40. DOCUMENTATION

When implementing a significant feature, update documentation where necessary.

Important documentation includes:

```text
README.md
AGENTS.md
docs/architecture/
docs/api/
docs/database/
docs/trading/
docs/development/
```

Do not allow the documentation to become completely disconnected from the codebase.

---

# 41. PHASED DEVELOPMENT

Build the project in this order:

## Phase 0

Foundation

```text
Repository
Monorepo
Next.js
NestJS
PostgreSQL
Redis
Docker
Testing
CI
Documentation
```

## Phase 1

Authentication

```text
Users
Registration
Login
Sessions
Roles
Protected routes
```

## Phase 2

Market Data

```text
Markets
Symbols
Candles
Historical data
Market provider abstraction
Charts
```

## Phase 3

Strategy Engine

```text
Strategy interface
Signals
Indicators
Strategy registry
Initial strategies
```

## Phase 4

Backtesting

```text
Historical replay
Simulated execution
Fees
Slippage
P&L
Metrics
Reports
```

## Phase 5

Risk Engine

```text
Position sizing
Risk limits
Exposure
Drawdown
Circuit breaker
```

## Phase 6

Paper Trading

```text
Paper broker
Simulated orders
Positions
Portfolio
Bot lifecycle
```

## Phase 7

Bot Engine

```text
Workers
Queues
Bot execution
Monitoring
Logs
Recovery
```

## Phase 8

Live Trading

```text
Broker adapter
Credentials
Real orders
Order reconciliation
Position reconciliation
Rate limits
Emergency controls
```

## Phase 9

Analytics

```text
Portfolio analytics
Strategy analytics
Trade analytics
Performance reports
```

## Phase 10

AI

```text
AI strategy assistant
Strategy generation
Backtest analysis
Performance analysis
Research assistant
```

Do not skip foundational phases.

---

# 42. CURRENT MVP PRIORITY

The immediate objective is NOT live trading.

The first meaningful product workflow is:

```text
Create Account
     ↓
Create Strategy
     ↓
Configure Strategy
     ↓
Backtest
     ↓
View Results
     ↓
Paper Trade
     ↓
Start Bot
     ↓
Monitor Bot
     ↓
View Trades
     ↓
Analyze Performance
```

Only after this workflow is reliable should live trading become a priority.

---

# 43. FIRST TASK

When the repository is initially opened, DO NOT start building trading functionality.

First:

1. Read `README.md`.
2. Read this `AGENTS.md`.
3. Inspect the repository.
4. Identify whether it is empty.
5. Analyze the architecture.
6. Create:

```text
docs/PHASE_0_IMPLEMENTATION_PLAN.md
```

The plan must include:

- Project structure
- Technology stack
- Database architecture
- API modules
- Frontend modules
- Worker architecture
- Redis usage
- Docker setup
- Testing strategy
- Security strategy
- Development sequence
- Potential risks

Then stop and present the plan.

Do not begin major implementation until the architecture has been reviewed.

---

# 44. REQUIRED RESPONSE FORMAT

When completing a development task, report:

```text
## Summary

What was implemented.

## Files Changed

List the files created or modified.

## Architecture

Explain how the implementation fits into the existing architecture.

## Tests

List tests actually executed.

## Verification

List:
- Type checking
- Linting
- Unit tests
- Integration tests
- E2E tests where applicable

## Issues

List anything that remains unresolved.

## Next Step

Recommend the next logical task.
```

Do not claim tests passed if they were not executed.

---

# 45. STOP CONDITIONS

Stop and ask for clarification when:

- Requirements conflict.
- A destructive database migration is required.
- A major architecture change is necessary.
- Production credentials are required.
- A live trading operation is unclear.
- Financial behavior is ambiguous.
- A security decision has significant consequences.
- Existing behavior would be broken.
- You are unsure whether an operation could create duplicate financial transactions.

Do not guess when guessing could cause financial or security problems.

---

# 46. GOLDEN RULE

The most important rule for Trading Bolt is:

> NEVER SACRIFICE CORRECTNESS, SECURITY OR FINANCIAL SAFETY FOR DEVELOPMENT SPEED.

Build the platform incrementally.

Understand before modifying.

Test before declaring success.

Keep responsibilities separated.

Never allow strategies to bypass risk controls.

Never allow AI to bypass safety controls.

Never expose secrets.

Never assume generated code is correct.

Build Trading Bolt as production-quality financial infrastructure, not as a demo.
