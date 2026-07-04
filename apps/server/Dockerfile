FROM oven/bun:1-slim

WORKDIR /app

ENV SKIP_ENV_VALIDATION=1

COPY . .
RUN bun install

ENV NODE_ENV=production
RUN bun -e 'const keys=["DATABASE_URL","BETTER_AUTH_SECRET","BETTER_AUTH_URL","CORS_ORIGIN","COGNEE_BASE_URL","COGNEE_API_KEY","COGNEE_CLOUD_BASE_URL","COGNEE_CLOUD_API_KEY"]; console.log("Build-time env check:"); for (const key of keys) { const value = process.env[key]; const secret = /SECRET|KEY|DATABASE_URL/.test(key); console.log(`${key}=${value ? (secret ? `[set:${value.length}]` : value) : "[missing]"}`); }'
RUN bun run build --filter=server
ENV SKIP_ENV_VALIDATION=

EXPOSE 3000

WORKDIR /app/apps/server
CMD ["sh", "-c", "bun -e 'const keys=[\"DATABASE_URL\",\"BETTER_AUTH_SECRET\",\"BETTER_AUTH_URL\",\"CORS_ORIGIN\",\"COGNEE_BASE_URL\",\"COGNEE_API_KEY\",\"COGNEE_CLOUD_BASE_URL\",\"COGNEE_CLOUD_API_KEY\"]; console.log(\"Runtime env check:\"); for (const key of keys) { const value = process.env[key]; const secret = /SECRET|KEY|DATABASE_URL/.test(key); console.log(`${key}=${value ? (secret ? `[set:${value.length}]` : value) : \"[missing]\"}`); }' && bun run dist/index.mjs"]
