import { desc, relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { project } from "./project";
import { projectFile } from "./project-file";

/**
 * One conversation about one file. Replaced the old `history` array approach
 * where turn N shipped N turns of JSON (O(n^2) cost) and one flat transcript
 * fed every diagram on the canvas.
 *
 * `project_id` is denormalised to avoid an extra join on every message append.
 * `file_id` is nullable: project-wide chats (POST /:projectId/chat) belong to
 * no file. The open thread is the most recently updated one -- no `is_active`
 * flag needed.
 */
export const projectFileThread = pgTable(
  "project_file_thread",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    // Null for a project-wide conversation; set for a conversation about one canvas.
    fileId: text("file_id").references(() => projectFile.id, { onDelete: "cascade" }),
    title: text("title").default("New chat").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    // Opening a canvas asks for its newest thread (`WHERE file_id = $1 ORDER BY
    // updated_at DESC LIMIT 1`) and the history list asks for all of them in that
    // same order, so one index answers both from the leading column plus the sort.
    // It also covers the `file_id` foreign key: deleting a file has to find every
    // thread pointing at it, and without a leading-column index that is a
    // sequential scan per deletion -- the exact gap migration 0012 existed to fix.
    index("project_file_thread_file_updated_idx").on(table.fileId, desc(table.updatedAt)),
    // The same two jobs for project-wide threads, and it covers the `project_id`
    // foreign key that deleting a project cascades through.
    index("project_file_thread_project_updated_idx").on(table.projectId, desc(table.updatedAt)),
  ],
);

export const projectFileThreadRelations = relations(projectFileThread, ({ one }) => ({
  project: one(project, {
    fields: [projectFileThread.projectId],
    references: [project.id],
  }),
  file: one(projectFile, {
    fields: [projectFileThread.fileId],
    references: [projectFile.id],
  }),
}));
