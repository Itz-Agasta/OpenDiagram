# syntax=docker/dockerfile:1.7
FROM oven/bun:1-slim

WORKDIR /app

# git is required at runtime: repo import shells out to `git clone`.
# ca-certificates so the HTTPS clone against github.com verifies.
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

ENV NODE_ENV=production
RUN bun run build --filter=server
# ELK worker must be resolvable from dist/ after bundling.
# createRequire(import.meta.url) resolves from dist/index.mjs, so symlink
# elkjs into server's node_modules where it can walk up to find it.
RUN mkdir -p /app/apps/server/node_modules && \
    ln -s /app/node_modules/elkjs /app/apps/server/node_modules/elkjs
ENV SKIP_ENV_VALIDATION=

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["bun", "run", "dist/index.mjs"]
