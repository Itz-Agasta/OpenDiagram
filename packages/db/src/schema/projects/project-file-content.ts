import { relations } from "drizzle-orm";
import { jsonb, pgTable, text } from "drizzle-orm/pg-core";

import { projectFile } from "./project-file";

/**
 * The heavy half of a file, split 1:1 off `project_file`.
 *
 * `scene`, `spec`, `content` and `history` are the only large columns in the
 * schema -- a canvas with a pasted screenshot in it runs to hundreds of
 * kilobytes -- while `project_file` itself is a handful of short strings and two
 * timestamps. Keeping them in one table meant the row was almost always TOASTed,
 * so the two hottest queries in the app (the dashboard tree and the workspace
 * file list, neither of which wants a byte of this) shared their pages and their
 * cache with data they never read.
 *
 * Column selection already keeps the detoast itself from happening -- Postgres
 * does not fetch out-of-line values for columns a query does not select -- so
 * this is about page density and I/O, not about avoiding a decompress. The
 * metadata table is now narrow enough that the working set for a list query is a
 * small fraction of what it was.
 *
 * Exactly one row per file, created with the file and removed with it by the
 * cascade on `file_id`. Reads still use a left join and writes still upsert, so
 * a file whose content row is somehow missing degrades to empty rather than
 * disappearing from a list.
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
