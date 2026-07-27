/**
 * Idempotency ledger for inbound Dodo webhooks. Dodo retries on any non-2xx,
 * so the same event id can arrive several times; the handler inserts here first
 * and treats a conflict as "already processed".
 *
 * The raw payload is kept as an audit trail -- when a paid user reports a
 * missing upgrade, this is the only record of what Dodo actually sent.
 */
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const webhookEvent = pgTable(
  "webhook_event",
  {
    /** The `webhook-id` header. Standard Webhooks guarantees it is unique per event. */
    id: text("id").primaryKey(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload").notNull(),
    /** Null while in flight; set once the handler's DB writes committed. */
    processedAt: timestamp("processed_at"),
    /** Handler failure message, so a stuck event is greppable rather than silent. */
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("webhook_event_created_at_idx").on(table.createdAt)],
);
