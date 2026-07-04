import { relations } from "drizzle-orm";
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { project } from "./project";

export const projectFile = pgTable(
  "project_file",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    scene: jsonb("scene"),
    spec: jsonb("spec"),
    content: jsonb("content"),
    history: jsonb("history").$default(() => []),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("project_file_projectId_idx").on(table.projectId),
    index("project_file_type_idx").on(table.type),
  ],
);

export const projectFileRelations = relations(projectFile, ({ one }) => ({
  project: one(project, {
    fields: [projectFile.projectId],
    references: [project.id],
  }),
}));
