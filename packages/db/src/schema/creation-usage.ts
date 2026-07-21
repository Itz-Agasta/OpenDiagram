import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const creationUsageActorTypes = ["guest", "user"] as const;

export const creationUsage = pgTable(
  "creation_usage",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    actorType: text("actor_type", { enum: creationUsageActorTypes }).notNull(),
    actorId: text("actor_id").notNull(),
    windowStart: timestamp("window_start").notNull(),
    count: integer("count").default(0).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex("creation_usage_actor_window_idx").on(
      table.actorType,
      table.actorId,
      table.windowStart,
    ),
    check("creation_usage_actor_type_check", sql`${table.actorType} IN ('guest', 'user')`),
    check("creation_usage_count_check", sql`${table.count} >= 0`),
  ],
);
