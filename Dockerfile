# syntax=docker/dockerfile:1
#
# One build for the whole monorepo, then a small image per app:
#
#   docker build --target api    -t pointshub-api .
#   docker build --target worker -t pointshub-worker .
#   docker build --target web    -t pointshub-web --build-arg API_URL=http://api:4000 .
#   docker build --target tools  -t pointshub-tools .   # migrations and seeding
#
# The workspace is installed and built once; each app image then gets only its own production
# dependencies (`pnpm deploy`) or, for the web app, Next.js's traced standalone server.

ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-slim AS base
RUN npm install --global --allow-scripts=pnpm pnpm@12.7.0
WORKDIR /repo

# --- Build -------------------------------------------------------------------------------------
FROM base AS build
# Download every package from the lockfile alone, so this layer survives source changes.
COPY pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm fetch --store-dir /pnpm/store
COPY . .
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --offline --store-dir /pnpm/store

# The web app's /api/v1 rewrite and public variables are fixed when Next.js builds.
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_DEMO_INBOX_URL=
ENV API_URL=$API_URL \
    NEXT_PUBLIC_DEMO_INBOX_URL=$NEXT_PUBLIC_DEMO_INBOX_URL \
    BUILD_STANDALONE=true \
    NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @pointshub/api deploy --prod --store-dir /pnpm/store /out/api && \
    pnpm --filter @pointshub/worker deploy --prod --store-dir /pnpm/store /out/worker

# --- Runtime images ----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
USER node

FROM runtime AS api
COPY --from=build --chown=node:node /out/api ./
EXPOSE 4000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD ["node", "-e", "fetch('http://localhost:'+(process.env.API_PORT||4000)+'/api/v1/health/live').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "dist/main.js"]

FROM runtime AS worker
COPY --from=build --chown=node:node /out/worker ./
CMD ["node", "dist/main.js"]

FROM runtime AS web
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
ENV PORT=3000 \
    HOSTNAME=0.0.0.0
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD ["node", "-e", "fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]

# Migrations and demo data need the Prisma CLI and the seed's TypeScript, so this image keeps
# the full workspace. It only runs as a one-off job, never as a long-lived service.
FROM build AS tools
ENV NODE_ENV=production
WORKDIR /repo/packages/db
CMD ["pnpm", "migrate:deploy"]
