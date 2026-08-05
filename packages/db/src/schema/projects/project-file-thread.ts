import { desc, relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { project } from "./project";
import { projectFile } from "./project-file";

/**
 * One conversation about one file. A file has many.
 *
 * Chat used to be a single `history` array on `project_file_content`, rewritten
 * whole on every turn, which made two problems inevitable. Bytes: turn twenty
 * shipped twenty turns of JSON to append one message, so cost grew with the
 * square of conversation length. And context: a canvas holds several diagrams --
 * `use-diagram-canvas` keys frames by `spec.title`, so a new title draws a new
 * frame -- while one flat transcript fed all of them to the model on every
 * request, paying for nine dead diagrams to edit the tenth.
 *
 * Threads bound both. Only the open thread reaches the prompt, and the user ends
 * one explicitly with "New chat" rather than the app guessing when a subject
 * changed.
 *
 * The diagrams do NOT live here. An earlier attempt kept a `spec` and `frame_id`
 * on this table; a canvas holds several diagrams and they stay on screen through
 * "New chat", so they belong to the file, not to one conversation. They live in
 * `project_file_content.spec` as a keyed list. Frame identity is discussed below
 * because the reasoning still applies where it now lives (`canvas-diagrams.ts`).
 *
 * There is deliberately no `is_active` flag or `active_thread_id` on the file.
 * The open thread is simply the most recently updated one, which needs no extra
 * column, no partial unique index to keep a single flag honest, and no circular
 * foreign key between file and thread.
 *
 * Two parents, and both earn their place. `project_id` is the ownership anchor:
 * every read and write here has to prove the row belongs to the caller, and
 * carrying the project directly makes that `thread -> project` instead of
 * `thread -> project_file -> project`, one join fewer on every message append,
 * thread load and thread list. It is safe to denormalise because nothing in the
 * codebase moves a file between projects.
 *
 * `file_id` is nullable because the app has two kinds of conversation, not one.
 * A canvas conversation belongs to a file; the project chat behind
 * `POST /:projectId/chat` reads every file in the project and belongs to none of
 * them. Today both are stored against a file, so project-scoped answers sit
 * inside one arbitrary file's transcript. A nullable file id gives the second
 * kind a real home without a second table or a polymorphic foreign key.
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
