# syntax=docker/dockerfile:1.20
# 1.20 for COPY --parents (manifest-only copies that keep apps/*/packages/* paths).

FROM oven/bun:1-slim AS deps
WORKDIR /app
ENV SKIP_ENV_VALIDATION=1

# Manifests only, so editing src/ doesn't bust this layer's install cache.
COPY package.json bun.lock bunfig.toml ./
COPY --parents apps/*/package.json packages/*/package.json ./
# server... = server plus every workspace it depends on, transitively.
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --filter 'server...' --frozen-lockfile

FROM deps AS build
ENV NODE_ENV=production
COPY --parents apps/server packages/config packages/auth packages/db packages/env packages/harness ./
RUN bun run --filter server build

FROM oven/bun:1-slim AS runtime
WORKDIR /app

# git is required at runtime: repo import shells out to `git clone`.
# ca-certificates ships preinstalled on this base image already.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git=1:2.47.3-0+deb13u1 \
  && rm -rf /var/lib/apt/lists/*

ENV SKIP_ENV_VALIDATION=1
COPY package.json bun.lock bunfig.toml ./
COPY --parents apps/*/package.json packages/*/package.json ./
# --omit=peer,optional: evlog's framework integrations declare next/hono/express/etc
# as optional peers, and bun auto-installs any optional peer already resolved
# elsewhere in the lockfile (apps/web's `next`) even though server never needs it.
# Without --omit this pulled in next + its swc binaries + sharp (~450MB dead weight).
# https://github.com/oven-sh/bun/issues/26400
RUN --mount=type=cache,target=/root/.bun/install/cache \
  bun install --filter 'server...' --production --omit=peer --omit=optional --frozen-lockfile
ENV SKIP_ENV_VALIDATION=
ENV NODE_ENV=production

COPY --from=build /app/apps/server/dist /app/apps/server/dist

# evlog's fs drain writes every request to ./.evlog unconditionally (src/index.ts).
# Precreate it owned by the runtime user or the first request hits EACCES.
RUN mkdir -p /app/apps/server/.evlog && chown bun:bun /app/apps/server/.evlog

WORKDIR /app/apps/server
USER bun

EXPOSE 3000
# Cloud Run ignores this (it has its own startup/liveness probes); this is for
# plain `docker run` / compose. https://docs.cloud.google.com/run/docs/configuring/healthchecks
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD bun -e "fetch('http://localhost:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# --preload is load-bearing for db tracing. See the Sentry note in src/index.ts.
CMD ["bun", "run", "--preload", "@sentry/node/preload", "dist/index.mjs"]
