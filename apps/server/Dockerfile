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
ENV SKIP_ENV_VALIDATION=

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["bun", "run", "dist/index.mjs"]
