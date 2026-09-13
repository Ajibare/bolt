# syntax=docker/dockerfile:1
FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable \
    && pnpm config set store-dir /pnpm/store
WORKDIR /app

FROM base AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm --filter @trading-bolt/shared build
RUN pnpm --filter web build
RUN pnpm --filter web deploy --prod /app/deploy/web

FROM base AS runtime
ENV NODE_ENV=production
ENV PORT=3000
WORKDIR /app
COPY --from=build /app/deploy/web ./deploy/web
COPY --from=build /app/apps/web/.next ./deploy/web/.next
COPY --from=build /app/apps/web/public ./deploy/web/public
WORKDIR /app/deploy/web
EXPOSE 3000
CMD ["node_modules/.bin/next", "start"]