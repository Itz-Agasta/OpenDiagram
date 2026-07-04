# syntax=docker/dockerfile:1.7
FROM oven/bun:1-slim

WORKDIR /app

ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN --mount=type=cache,target=/root/.bun/install/cache bun install

ENV NODE_ENV=production
RUN bun run build --filter=server
ENV SKIP_ENV_VALIDATION=

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["bun", "run", "dist/index.mjs"]
