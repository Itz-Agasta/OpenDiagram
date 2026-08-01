import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { user } from "../auth";

export const projectSources = ["manual", "github_import"] as const;

export const projectGenerationStatuses = [
  "none",
  "queued",
  "planning",
  "creating",
  "generating",
  "done",
  "failed",
] as const;

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
    generationStatus: text("generation_status", { enum: projectGenerationStatuses })
      .default("none")
      .notNull(),
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
