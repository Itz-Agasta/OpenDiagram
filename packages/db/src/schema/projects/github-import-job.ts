import { index, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { user } from "../auth";
import { project } from "./project";

export const githubImportJobStatuses = [
  "queued",
  "cloning",
  "documenting",
  "done",
  "failed",
] as const;

// TODO: i need to look into it again when i will redeisgn the github imoort
export const githubImportJob = pgTable(
  "github_import_job",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    repoFullName: text("repo_full_name").notNull(),
    status: text("status", { enum: githubImportJobStatuses }).default("queued").notNull(),
    message: text("message").notNull(),
    error: text("error"),
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    projectName: text("project_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [
    index("github_import_job_user_id_idx").on(table.userId),
    // Deliberately no plain index on `status`. The only query that filters it is
    // the in-flight lookup below, which the partial unique index answers in full
    // -- and a five-value column read through a negated predicate is something
    // the planner would decline to use anyway.
    // Covers the `project_id` foreign key. Deleting a project has to find every
    // job pointing at it to apply `onDelete: "set null"`, and without this that
    // is a sequential scan of the whole table per project deletion.
    index("github_import_job_project_id_idx").on(table.projectId),
    uniqueIndex("github_import_job_user_repo_partial_idx")
      .on(table.userId, table.repoFullName)
      .where(sql`status NOT IN ('done', 'failed')`),
  ],
);
