import type { EvalPrompt } from "./prompts";

/**
 * Long pastes where most of the text is not architecture. `forbid` terms must
 * not appear in any drawn label: business prose, chatter, or a proposal the ask
 * explicitly excludes.
 */
export const noisyPrompts: EvalPrompt[] = [
  {
    id: "prd-noisy",
    text: `Can you diagram the system from our PRD below?

# Lumen - PRD v0.7 (DRAFT, do not share outside product)

## Background
Teams lose 30% of meeting context within 48 hours (internal survey, n=212). Competitors like Otter and Fireflies focus on transcription; we want to own "decisions and follow-ups". Market sizing: 38M knowledge workers in NA alone, SAM ~$2.1B.

## Personas
- Priya, engineering manager, 9 meetings/day, hates writing notes.
- Marcus, sales lead, lives in Salesforce, wants CRM sync (later, not v1).

## Goals / OKRs
- O1: 5k weekly active teams by end of Q3. KR: 40% week-4 retention.
- O2: NPS above 45.

## Pricing
Free (5 meetings/mo), Pro $12/seat, Business $20/seat with SSO. Annual discount 20%.

## Technical overview
Users record in the web app (Next.js) or the React Native mobile app. Audio uploads go straight to S3 with presigned URLs from the API (Node, Fastify). The API writes a job to SQS; a GPU transcription worker running Whisper picks it up, writes the transcript to Postgres and emits a "transcript.ready" event. A summarizer worker calls OpenAI to extract decisions and action items, stores them in Postgres, and pushes a notification over our WebSocket gateway so open clients update live. Redis caches meeting lists and holds rate-limit counters. Auth is Auth0. We sync action items to Slack and read upcoming meetings from Google Calendar. Billing through Stripe webhooks hitting the API. Logs and APM go to Datadog.

## Launch plan
Private beta Aug 12, public launch Sep 30, ProductHunt the same week. Marketing owns the landing page refresh.

## Team & hiring
2 backend, 1 mobile, 1 ML; hiring a designer (req open since June).

## Open questions
- Do we keep audio after transcription? Legal says 30 days max.
- Should summaries be editable?`,
    expect: [
      "web|next",
      "mobile|react native",
      "api|fastify",
      "s3|object|audio",
      "sqs|queue",
      "transcri|whisper",
      "summar|openai|llm",
      "postgres",
      "redis",
      "websocket|notif",
      "auth0|auth",
      "slack",
      "calendar",
      "stripe|billing",
      "datadog|observab|monitor",
    ],
    forbid: [
      "persona",
      "okr",
      "nps",
      "pricing",
      "hiring",
      "designer",
      "marketing",
      "producthunt",
      "launch",
      "competitor",
      "otter",
      "salesforce",
      "priya",
      "marcus",
    ],
  },
  {
    id: "slack-noisy",
    text: `pasting the thread from #checkout-eng, can you draw how checkout works RIGHT NOW (not the kafka proposal)

dana: morning! anyone else's jenkins stuck on the flaky cart test again 🙃
raj: yes. retried twice. also who took the last oat milk
dana: guilty
tom: ok real question - new hire (hi Lina!) asked how checkout flows end to end and I realised nobody has a diagram
lina: 👋 thanks, yes please, I'm lost
raj: ok so browser -> CloudFront -> ALB -> checkout-svc (the Go one). checkout-svc reads the cart from Redis
tom: and calls inventory-svc to reserve stock, inventory is on DynamoDB
raj: right. then payments-svc, which talks to Adyen. payments has its own RDS Postgres, orders live in the orders RDS Postgres that checkout-svc writes
dana: after the order commits checkout puts an OrderPlaced event on EventBridge
tom: two consumers: email-worker (sends the confirmation via SES) and warehouse-sync, which calls the ShipBob API
raj: and fraud-check is a Lambda payments-svc calls sync before capturing
lina: amazing. what's the kafka thing I keep hearing about
tom: proposal to replace EventBridge with MSK Kafka next year. NOT happening yet, ignore it
dana: my cat just walked across the keyboard, if I send gibberish that's why
raj: I'm on PTO thursday-friday btw
tom: lunch at the ramen place?
dana: yes`,
    expect: [
      "browser|client|web",
      "cloudfront|cdn",
      "alb|load balanc",
      "checkout",
      "redis|cart",
      "inventory",
      "dynamo",
      "payment",
      "adyen",
      "postgres|rds",
      "order",
      "eventbridge|event",
      "email|ses",
      "warehouse|shipbob",
      "fraud",
    ],
    forbid: [
      "kafka",
      "msk",
      "jenkins",
      "oat",
      "lunch",
      "ramen",
      "pto",
      "cat\\b",
      "lina",
      "raj",
      "dana",
      "tom\\b",
    ],
  },
  {
    id: "readme-noisy",
    text: `Diagram the architecture from this README:

# Beacon 🛰️  ![build](https://img.shields.io/badge/build-passing-green) ![license](https://img.shields.io/badge/license-AGPL-blue)

Privacy-first, self-hosted web analytics. No cookies. GDPR friendly.

## Quick start
\`\`\`
git clone https://github.com/example/beacon && cd beacon
cp .env.example .env
docker compose up -d
\`\`\`
Open http://localhost:8000 and create your first site.

## Configuration
| Variable | Default | Description |
| BEACON_SECRET | - | session signing key |
| CLICKHOUSE_URL | http://clickhouse:8123 | events store |
| SMTP_HOST | - | for email reports |

## How it works
A 2KB tracker script on your site posts pageviews and custom events to the ingest API (Rust, axum). Ingest validates, strips IPs after a GeoIP lookup and batches inserts into ClickHouse. A background worker enriches events with MaxMind GeoIP and user-agent parsing, and every Monday sends email reports through your SMTP server. The dashboard is a SvelteKit app that queries ClickHouse through the query API; site settings, users and API keys live in Postgres. Redis holds dashboard sessions and a short-lived query cache. Optional nightly backups of ClickHouse and Postgres go to any S3-compatible bucket.

## FAQ
**Is it really free?** Yes, AGPL. Hosted version coming soon.
**Does it support Google Analytics import?** Not yet, see #212.

## Contributing
PRs welcome! Run \`cargo fmt\` and \`pnpm lint\` before pushing. Sign the CLA.

## License
AGPL-3.0`,
    expect: [
      "tracker|script|site",
      "ingest",
      "clickhouse",
      "worker|enrich",
      "geoip|maxmind",
      "email|smtp|report",
      "dashboard|sveltekit",
      "query",
      "postgres",
      "redis",
      "s3|backup",
    ],
    forbid: [
      "faq",
      "contribut",
      "license",
      "agpl",
      "cla\\b",
      "badge",
      "cargo",
      "pnpm",
      "google analytics",
      "quick start",
    ],
  },
];
