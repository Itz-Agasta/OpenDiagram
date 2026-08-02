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
 * One message in one thread. Append-only: rows are inserted, never updated.
 *
 * This replaces rewriting a whole `history` array per turn. Appending one row
 * costs one row regardless of how long the conversation is, which is the point --
 * the old shape re-sent the entire transcript to add a message to the end of it.
 *
 * `seq` is per-thread and starts at 1, assigned as `COALESCE(MAX(seq), 0) + 1`
 * scoped to the thread. A global sequence would couple write throughput across
 * every conversation in the product for no benefit; per-thread counters scale
 * with the number of threads. Two concurrent inserts into one thread would
 * collide on the primary key, which fails the write cleanly rather than silently
 * reordering a conversation -- and a single user typing into a single thread does
 * not produce that race.
 *
 * `parts` is the AI SDK's own part array, stored as-is. The shape varies by part
 * type and the SDK extends it between versions, so pinning it into columns would
 * mean a migration per SDK release. `role` is promoted out of it because it is
 * the one field ever filtered on.
 *
 * `client_id` is the message id the browser generated. It has to survive the
 * round trip: the AI SDK matches messages by it, and `turnIdFor` in the diagram
 * route derives the billing turn from the trailing user message's id, so a
 * server-assigned id would break both. It is also unique per thread, which is
 * what makes the append idempotent -- see the index below.
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
