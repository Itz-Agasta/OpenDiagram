import { relations, sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, check } from "drizzle-orm/pg-core";

import { project } from "./project";
import { projectFileContent } from "./project-file-content";

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
    // `scene`, `spec`, `content` and `history` live in `project_file_content`,
    // keyed 1:1 by file id. See that file for why. This table is deliberately
    // narrow: it is what the dashboard tree and the file list read, and neither
    // of them wants any of the large columns.
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("project_file_projectId_idx").on(table.projectId),
    // Deliberately no index on `type`. It is only ever selected, never filtered,
    // and with two distinct values a btree would be ignored even if it were --
    // the check constraint below is what actually guards the column.
    check("project_file_type_check", sql`${table.type} IN ('diagram', 'doc')`),
  ],
);

export const projectFileRelations = relations(projectFile, ({ one }) => ({
  project: one(project, {
    fields: [projectFile.projectId],
    references: [project.id],
  }),
  content: one(projectFileContent, {
    fields: [projectFile.id],
    references: [projectFileContent.fileId],
  }),
}));
