# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable \
    && pnpm config set store-dir /pnpm/store
WORKDIR /app

FROM base AS build
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @trading-bolt/shared build
RUN pnpm --filter worker build
RUN pnpm --filter worker deploy --prod /app/deploy/worker

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/deploy/worker ./deploy/worker
COPY --from=build /app/apps/worker/dist ./deploy/worker/dist
WORKDIR /app/deploy/worker
CMD ["node", "dist/index.js"]