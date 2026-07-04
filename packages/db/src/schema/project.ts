import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "./auth";

export const projectMemoryStatuses = [
  "not_started",
  "pending",
  "ingesting",
  "ready",
  "failed",
  "not_ready",
] as const;

export const projectSources = ["manual", "github_import"] as const;

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
    source: text("source", { enum: projectSources }).default("manual").notNull(),
    sourceMetadata: jsonb("source_metadata"),
    memoryDatasetId: text("cognee_dataset_id"),
    memoryStatus: text("cognee_status", { enum: projectMemoryStatuses })
      .default("not_started")
      .notNull(),
    memoryError: text("cognee_error"),
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
