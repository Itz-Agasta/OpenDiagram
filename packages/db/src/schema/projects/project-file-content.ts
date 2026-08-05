import { relations } from "drizzle-orm";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { projectFile } from "./project-file";

/**
 * The heavy half of a file, split 1:1 off `project_file`. scene/spec/content/
 * history run to hundreds of KB; keeping them here means the dashboard tree and
 * file list (which never touch these columns) don't share pages with TOASTed
 * data. One row per file, cascade-deleted with it.
 */
export const projectFileContent = pgTable("project_file_content", {
  fileId: text("file_id")
    .primaryKey()
    .references(() => projectFile.id, { onDelete: "cascade" }),
  scene: jsonb("scene"),
  spec: jsonb("spec"),
  content: jsonb("content"),
  history: jsonb("history")
    .$default(() => [])
    .notNull(),
});

export const projectFileContentRelations = relations(projectFileContent, ({ one }) => ({
  file: one(projectFile, {
    fields: [projectFileContent.fileId],
    references: [projectFile.id],
  }),
}));
