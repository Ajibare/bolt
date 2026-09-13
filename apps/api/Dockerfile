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
RUN pnpm --filter api build
RUN pnpm --filter api deploy --prod /app/deploy/api

FROM base AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/deploy/api ./deploy/api
COPY --from=build /app/apps/api/dist ./deploy/api/dist
WORKDIR /app/deploy/api
EXPOSE 4000
CMD ["node", "dist/main.js"]