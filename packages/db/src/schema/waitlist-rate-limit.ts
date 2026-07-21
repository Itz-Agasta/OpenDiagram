import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const waitlistRateLimit = pgTable(
  "waitlist_rate_limit",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorKeyHash: text("actor_key_hash").notNull(),
    windowStart: timestamp("window_start").notNull(),
    count: integer("count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("waitlist_rate_limit_actor_window_idx").on(table.actorKeyHash, table.windowStart),
    check("waitlist_rate_limit_count_check", sql`${table.count} >= 0`),
  ],
);
