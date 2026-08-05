import { relations, sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { projectFileThread } from "./project-file-thread";

export const projectFileMessageRoles = ["user", "assistant"] as const;

/**
 * One message in one thread. Append-only (inserted, never updated).
 *
 * `seq` is per-thread, starting at 1. Per-thread counters avoid coupling write
 * throughput across conversations. Concurrent inserts collide on the PK, which
 * fails cleanly rather than reordering.
 *
 * `parts` is the AI SDK's part array stored as-is -- pinning it to columns
 * would mean a migration per SDK release. `role` is promoted because it's the
 * only field filtered on.
 *
 * `client_id` is the browser-generated message id. The AI SDK matches on it,
 * and `turnIdFor` derives the billing turn from it. Unique per thread for
 * idempotent appends (see unique index below).
 */
export const projectFileMessage = pgTable(
  "project_file_message",
  {
    threadId: text("thread_id")
      .notNull()
      .references(() => projectFileThread.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    clientId: text("client_id").notNull(),
    role: text("role", { enum: projectFileMessageRoles }).notNull(),
    parts: jsonb("parts").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [
    // Every access path this table has, answered by one index.
    //
    // Opening a thread reads the tail (`WHERE thread_id = $1 ORDER BY seq DESC
    // LIMIT 50`) and scrolling back pages it (`AND seq < $2`) -- both are a
    // backward scan on this key. Deleting a thread cascades on `thread_id`, which
    // leads here, so that is covered too.
    //
    // Deliberately no index on `created_at`: `seq` already orders a thread, and
    // ordering by a timestamp instead would put two messages written in the same
    // millisecond in an arbitrary order.
    primaryKey({ columns: [table.threadId, table.seq] }),
    // Makes the append idempotent. `persistTurn` only marks messages saved once
    // the server confirms them, so a response lost after the insert committed
    // leaves the browser re-sending that turn; without this the retry lands a
    // second copy under fresh `seq` values and the transcript renders it twice.
    uniqueIndex("project_file_message_thread_client_idx").on(table.threadId, table.clientId),
    check("project_file_message_role_check", sql`${table.role} IN ('user', 'assistant')`),
    check("project_file_message_seq_check", sql`${table.seq} > 0`),
  ],
);

export const projectFileMessageRelations = relations(projectFileMessage, ({ one }) => ({
  thread: one(projectFileThread, {
    fields: [projectFileMessage.threadId],
    references: [projectFileThread.id],
  }),
}));
