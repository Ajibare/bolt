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
```

## Directory overview

```text
apps/
  web/       Next.js frontend
  api/       NestJS backend
  worker/    BullMQ worker
packages/
  shared/    shared types, enums, financial utils
  (trading packages introduced in later phases)
```
