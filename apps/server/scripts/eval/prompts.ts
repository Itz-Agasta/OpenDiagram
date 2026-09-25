import { noisyPrompts } from "./prompts-noisy";
import { scalePrompts } from "./prompts-scale";

/**
 * Eval prompts. `expect` lists the concepts a complete answer names, matched
 * case-insensitively at a word start against the drawn labels (see `coverage`
 * in run.ts); `a|b` means either. Coverage recall = matched / expected. Empty
 * `expect` skips the metric. `forbid` terms must appear in no label.
 */
export type EvalPrompt = { id: string; text: string; expect: string[]; forbid?: string[] };

const basePrompts: EvalPrompt[] = [
  {
    id: "url-shortener",
    text: "Design a URL shortener: API, cache, database, click analytics.",
    expect: ["api", "cache|redis", "database|postgres|dynamo|sql", "analytic"],
  },
  {
    id: "aws-images",
    text: "AWS architecture for a serverless image-processing pipeline: S3 upload, Lambda resize, SQS, DynamoDB metadata, CloudFront delivery.",
    expect: ["s3", "lambda", "sqs", "dynamo", "cloudfront"],
  },
  {
    id: "oauth-sequence",
    text: "Sequence diagram of an OAuth2 authorization code login with GitHub for a web app.",
    expect: ["browser|user", "github", "backend|server|app", "token"],
  },
  {
    id: "shop-erd",
    text: "ERD for an e-commerce store: users, products, orders, order items, payments, reviews.",
    expect: ["user", "product", "order", "item", "payment", "review"],
  },
  {
    id: "vague-startup",
    text: "Draw the architecture for my startup's app.",
    expect: [],
  },
  {
    id: "vague-chat",
    text: "diagram for a chat app",
    expect: [],
  },
  {
    id: "ride-hailing",
    text: "Backend for an Uber-like ride hailing app.",
    expect: [],
  },
  {
    id: "rag-saas",
    text: "Multi-tenant RAG SaaS: upload PDF/DOCX/images/websites, extract, chunk, embed, vector store, retrieve, rerank, LLM with streaming, conversation history, model selection, API keys, usage and billing, rate limits, background jobs, document versioning, tenant isolation. Full ingestion and query pipelines.",
    expect: [
      "upload",
      "extract|pars",
      "chunk",
      "embed",
      "vector",
      "retriev",
      "rerank",
      "llm",
      "stream",
      "history|conversation",
      "model",
      "api key",
      "billing|usage",
      "rate limit",
      "job|worker|queue",
      "version",
      "tenant",
    ],
  },
  {
    id: "food-delivery",
    text: "Global food delivery, 20M daily users: browse, search, order, cards and wallets, live tracking, chat with drivers, restaurant WebSockets, driver GPS streams, Kafka, Redis (incl. geo), PostgreSQL, Elasticsearch, object storage, payment idempotency, inventory reservation, order state machine, matching, ETA, notifications, fraud, observability, multi-region failover, DR.",
    expect: [
      "search|elasticsearch",
      "order",
      "payment|wallet",
      "track",
      "chat",
      "websocket",
      "gps|location",
      "kafka",
      "redis",
      "postgres",
      "object storage|s3|blob",
      "idempot",
      "inventory",
      "state machine|order state",
      "match|dispatch",
      "eta",
      "notif",
      "fraud",
      "observab|monitor",
      "region|failover",
    ],
  },
  {
    id: "ai-commerce",
    text: "Global multi-tenant AI commerce: NL product search, recommendations, image upload, AI shopping assistant, carts, orders, payments, shipment tracking, notifications, flash sales, inventory reservation, fraud, seller dashboards, real-time analytics, vector search, RAG over the catalog, LLM inference, image processing, Kafka, Redis, PostgreSQL, Elasticsearch, vector DB, object storage, CDN, WebSockets, workers, multi-region. Strong consistency for money, eventual for the rest. API gateway, authn/authz, rate limiting, observability, circuit breakers, retries, idempotency, DR, cross-region failover. Control plane vs data plane, sync vs async, stores, caches, queues, externals, all major flows.",
    expect: [
      "search",
      "recommend",
      "image",
      "assistant",
      "cart",
      "order",
      "payment",
      "shipment|shipping|tracking",
      "notif",
      "flash sale",
      "inventory",
      "fraud",
      "seller",
      "analytic",
      "vector",
      "rag|retriev",
      "llm|inference",
      "kafka",
      "redis",
      "postgres",
      "elasticsearch",
      "object storage|s3|blob",
      "cdn",
      "websocket",
      "worker",
      "gateway",
      "auth",
      "rate limit",
      "observab|monitor",
      "region|failover",
    ],
  },
];

export const prompts: EvalPrompt[] = [...basePrompts, ...scalePrompts, ...noisyPrompts];
