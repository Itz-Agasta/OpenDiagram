FROM oven/bun:1-slim

WORKDIR /app

ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN bun install

ENV NODE_ENV=production
RUN bun -e 'const keys=["DATABASE_URL","BETTER_AUTH_SECRET","BETTER_AUTH_URL","CORS_ORIGIN"]; console.log("Build-time env check:"); for (const key of keys) { const value = process.env[key]; const secret = /SECRET|DATABASE_URL/.test(key); console.log(`${key}=${value ? (secret ? `[set:${value.length}]` : value) : "[missing]"}`); }'
RUN bun run build --filter=server
ENV SKIP_ENV_VALIDATION=

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["sh", "-c", "bun -e 'const keys=[\"DATABASE_URL\",\"BETTER_AUTH_SECRET\",\"BETTER_AUTH_URL\",\"CORS_ORIGIN\"]; console.log(\"Runtime env check:\"); for (const key of keys) { const value = process.env[key]; const secret = /SECRET|DATABASE_URL/.test(key); console.log(`${key}=${value ? (secret ? `[set:${value.length}]` : value) : \"[missing]\"}`); }' && exec bun run dist/index.mjs"]
