import { relations } from "drizzle-orm";
import { integer, jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { projectFile } from "./project-file";

/**
 * The heavy half of a file, split 1:1 off project_file. scene/spec/content/
 * history run to hundreds of KB; keeping them here means the dashboard tree and
 * file list (which never touch these columns) do not share pages with TOASTed
 * data. One row per file, cascade-deleted with it.
 */
export const projectFileContent = pgTable("project_file_content", {
  fileId: text("file_id")
    .primaryKey()
    .references(() => projectFile.id, { onDelete: "cascade" }),
  scene: jsonb("scene"),
  /**
   * Bumped by every write that touches scene, and by nothing else. The canvas
   * sends element deltas against the revision it last had acknowledged, so this
   * is what lets the server tell "these changes apply to what I hold" from "this
   * client is working off a scene someone else has since replaced" and answer 409.
   *
   * Deliberately not updatedAt: that moves for a rename or a chat write too,
   * which would invalidate a perfectly good delta baseline.
   */
  sceneRev: integer("scene_rev").notNull().default(0),
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
