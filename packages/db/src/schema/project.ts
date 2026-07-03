import { relations } from "drizzle-orm";
import { pgTable, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const project = pgTable(
  "project",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    scene: jsonb("scene"),
    spec: jsonb("spec"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("project_userId_idx").on(table.userId)],
);

export const projectRelations = relations(project, ({ one }) => ({
  user: one(user, {
    fields: [project.userId],
    references: [user.id],
  }),
}));
