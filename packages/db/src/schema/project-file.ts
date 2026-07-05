import { relations, sql } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp, check } from "drizzle-orm/pg-core";

import { project } from "./project";

export const projectFileTypes = ["diagram", "doc"] as const;

export const projectFile = pgTable(
  "project_file",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    type: text("type", { enum: projectFileTypes }).notNull(),
    name: text("name").notNull(),
    scene: jsonb("scene"),
    spec: jsonb("spec"),
    content: jsonb("content"),
    history: jsonb("history")
      .$default(() => [])
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("project_file_projectId_idx").on(table.projectId),
    index("project_file_type_idx").on(table.type),
    check("project_file_type_check", sql`${table.type} IN ('diagram', 'doc')`),
  ],
);

export const projectFileRelations = relations(projectFile, ({ one }) => ({
  project: one(project, {
    fields: [projectFile.projectId],
    references: [project.id],
  }),
}));
